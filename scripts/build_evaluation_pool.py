#!/usr/bin/env python3
"""Build the evaluation pool from red_cards.csv.

Drops any listing whose features already appear in the training table, and
collapses exact duplicate listings to the first row. Cell values are copied
unchanged. Also writes a five-feature JSON file for self-paced draws.
"""

import json

from housing import FEATURES, HOUSES, POOL, REDS, ROOT, city_from_red, load_rows, signature

PUBLIC_POOL = ROOT / "public" / "data" / "evaluation_pool.json"


def feature_columns():
    with open(FEATURES, encoding="utf-8") as handle:
        config = json.load(handle)
    return [feature["column"] for feature in config["features"]]


def main():
    houses = load_rows(HOUSES)
    reds = load_rows(REDS)
    train = {signature(row) for row in houses}
    kept = []
    seen = set()
    for row in reds:
        key = signature(row)
        if key in train or key in seen:
            continue
        seen.add(key)
        kept.append(row)

    POOL.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(reds[0].keys())
    with open(POOL, "w", encoding="utf-8", newline="") as handle:
        writer = csv_writer(handle, fieldnames)
        writer.writeheader()
        writer.writerows(kept)

    columns = feature_columns()
    cards = []
    for row in kept:
        card = {"id": row["index"].strip(), "target": int(row["target"])}
        for column in columns:
            card[column] = row[column].strip()
        cards.append(card)
    with open(PUBLIC_POOL, "w", encoding="utf-8") as handle:
        json.dump({"cards": cards}, handle, indent=2)
        handle.write("\n")

    print(f"wrote {len(kept)} homes to {POOL.relative_to(ROOT)}")
    print(f"wrote {len(cards)} public cards to {PUBLIC_POOL.relative_to(ROOT)}")
    print("New York", sum(1 for row in kept if city_from_red(row) == "New York"))
    print("San Francisco", sum(1 for row in kept if city_from_red(row) == "San Francisco"))


def csv_writer(handle, fieldnames):
    import csv
    return csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")


if __name__ == "__main__":
    main()
