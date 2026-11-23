#!/usr/bin/env python3
"""Build the Group 1 screen pack, download CSV, and print-and-cut PDF.

Reads the training table and public/config/features.json. Does not change
any housing value. Card size is 63 by 88 mm, nine cards to an A4 page.
"""

import csv
import json
import shutil
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas

from housing import ATTRIBUTION, FEATURES, HOUSES, ROOT, load_rows

CSV_PATH = ROOT / "public" / "data" / "csvs" / "Group_1.csv"
PDF_PATH = ROOT / "public" / "data" / "pdfs" / "Group_1.pdf"
PACK_PATH = ROOT / "public" / "data" / "pack.json"
CSV_ATTRIBUTION = ROOT / "public" / "data" / "csvs" / "ATTRIBUTION.txt"
PDF_ATTRIBUTION = ROOT / "public" / "data" / "pdfs" / "ATTRIBUTION.txt"

CARD_W = 63 * mm
CARD_H = 88 * mm
COLUMNS = 3
ROWS = 3


def feature_config():
    with open(FEATURES, encoding="utf-8") as handle:
        return json.load(handle)["features"]


def group_one():
    rows = []
    for row in load_rows(HOUSES):
        if (row.get("group") or "").strip() == "1":
            rows.append(row)
    return rows


def display(feature, value):
    text = value.strip()
    if feature["format"] == "number":
        text = f"{int(float(text)):,}" if float(text).is_integer() else text
    return f"{feature['prefix']}{text}{feature['suffix']}"


def write_csv(rows, features):
    fieldnames = ["card_number"] + [feature["column"] for feature in features] + ["city"]
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        for row in rows:
            record = {"card_number": row["index"].strip(), "city": row["city"].strip()}
            for feature in features:
                record[feature["column"]] = row[feature["column"]].strip()
            writer.writerow(record)
    shutil.copyfile(ATTRIBUTION, CSV_ATTRIBUTION)
    PDF_ATTRIBUTION.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ATTRIBUTION, PDF_ATTRIBUTION)


def write_pack(rows, features):
    cards = []
    for row in rows:
        card = {"id": row["index"].strip(), "city": row["city"].strip()}
        for feature in features:
            card[feature["column"]] = row[feature["column"]].strip()
        cards.append(card)
    with open(PACK_PATH, "w", encoding="utf-8") as handle:
        json.dump({"packId": "group1", "cards": cards}, handle, indent=2)
        handle.write("\n")


def draw_crop_marks(pdf, left, bottom, width, height):
    reach = 4 * mm
    gap = 1.2 * mm
    pdf.setStrokeColorRGB(0, 0, 0)
    pdf.setLineWidth(0.4)
    corners = (
        (left, bottom, -1, -1),
        (left + width, bottom, 1, -1),
        (left, bottom + height, -1, 1),
        (left + width, bottom + height, 1, 1),
    )
    for x_pos, y_pos, x_dir, y_dir in corners:
        pdf.line(x_pos + x_dir * gap, y_pos, x_pos + x_dir * (gap + reach), y_pos)
        pdf.line(x_pos, y_pos + y_dir * gap, x_pos, y_pos + y_dir * (gap + reach))


def draw_card(pdf, row, features, left, bottom):
    pdf.setStrokeColorRGB(0, 0, 0)
    pdf.setLineWidth(1)
    pdf.rect(left, bottom, CARD_W, CARD_H)
    pdf.setFillColorRGB(0, 0, 0)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(left + 4 * mm, bottom + CARD_H - 8 * mm, row["city"].strip())
    pdf.setFont("Helvetica", 9)
    pdf.drawRightString(left + CARD_W - 4 * mm, bottom + CARD_H - 8 * mm, "#" + row["index"].strip())
    y_pos = bottom + CARD_H - 16 * mm
    for feature in features:
        pdf.setFont("Helvetica", 9)
        pdf.drawString(left + 4 * mm, y_pos, feature["label"])
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawRightString(left + CARD_W - 4 * mm, y_pos, display(feature, row[feature["column"]]))
        y_pos -= 11 * mm


def draw_cover(pdf, rows):
    attribution = ATTRIBUTION.read_text(encoding="utf-8").strip()
    cities = [row["city"].strip() for row in rows]
    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(20 * mm, 270 * mm, "Group 1 training cards")
    pdf.setFont("Helvetica", 12)
    text = pdf.beginText(20 * mm, 250 * mm)
    text.setLeading(16)
    lines = [
        f"{len(rows)} cards: {cities.count('New York')} New York and {cities.count('San Francisco')} San Francisco.",
        "Every group in the class uses this same pack.",
        "",
        "Cut along the crop marks. Each card is 63 mm by 88 mm,",
        "the size of a standard playing card, so it fits a common",
        "laminating pouch. Laminate the cards before they are",
        "handled in class. The city name is printed on every card.",
        "",
        "The housing data was collected for learning. It should not",
        "be used to draw conclusions about either city's property market.",
        "",
        attribution,
    ]
    for line in lines:
        text.textLine(line)
    pdf.drawText(text)
    pdf.showPage()


def write_pdf(rows, features):
    PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(PDF_PATH), pagesize=A4)
    pdf.setTitle("Group 1 training cards")
    draw_cover(pdf, rows)
    page_w, page_h = A4
    grid_w = CARD_W * COLUMNS
    grid_h = CARD_H * ROWS
    origin_x = (page_w - grid_w) / 2
    origin_y = (page_h - grid_h) / 2
    for start in range(0, len(rows), COLUMNS * ROWS):
        chunk = rows[start:start + COLUMNS * ROWS]
        for index, row in enumerate(chunk):
            column = index % COLUMNS
            row_index = index // COLUMNS
            left = origin_x + column * CARD_W
            bottom = origin_y + (ROWS - 1 - row_index) * CARD_H
            draw_crop_marks(pdf, left, bottom, CARD_W, CARD_H)
            draw_card(pdf, row, features, left, bottom)
        pdf.showPage()
    pdf.save()
    # pdfmetrics is imported so a missing standard font fails loudly at import time
    pdfmetrics.getFont("Helvetica")


def main():
    features = feature_config()
    rows = group_one()
    write_csv(rows, features)
    write_pack(rows, features)
    write_pdf(rows, features)
    print(f"Group 1 cards: {len(rows)}")


if __name__ == "__main__":
    main()
