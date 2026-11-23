"""Shared loaders for the housing card scripts. Values are never rewritten."""

import csv
from decimal import Decimal, InvalidOperation
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "source" / "part_1_data.csv"
HOUSES = ROOT / "data" / "working" / "houses.csv"
REDS = ROOT / "data" / "working" / "red_cards.csv"
POOL = ROOT / "data" / "working" / "evaluation_pool.csv"
FEATURES = ROOT / "public" / "config" / "features.json"
ATTRIBUTION = ROOT / "public" / "data" / "ATTRIBUTION.txt"

MATCH_FIELDS = [
    "beds",
    "bath",
    "price",
    "year_built",
    "sqft",
    "price_per_sqft",
    "elevation",
]


def load_rows(path):
    """Load a CSV, accepting a leading UTF-8 BOM."""
    with open(path, encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def load_source(path=SOURCE):
    """Load the R2D3 file, leaving its licence header untouched on disk."""
    with open(path, encoding="utf-8", newline="") as handle:
        lines = handle.readlines()
    start = 0
    for index, line in enumerate(lines):
        if line.startswith("in_sf,"):
            start = index
            break
    return list(csv.DictReader(lines[start:]))


def has_bom(path):
    with open(path, "rb") as handle:
        return handle.read(3) == b"\xef\xbb\xbf"


def as_decimal(value):
    text = (value or "").strip()
    try:
        return Decimal(text)
    except InvalidOperation:
        return text


def signature(row):
    return tuple(as_decimal(row[field]) for field in MATCH_FIELDS)


def city_from_source(row):
    return "San Francisco" if str(row["in_sf"]).strip() in ("1", "1.0") else "New York"


def city_from_red(row):
    return "New York" if str(row["target"]).strip() in ("0", "0.0") else "San Francisco"


def index_signatures(rows, city_of):
    """Map a feature signature to the source rows that share it and that city."""
    found = {}
    for row in rows:
        key = (signature(row), city_of(row))
        found.setdefault(key, []).append(row)
    return found


def duplicate_groups(rows):
    groups = {}
    for index, row in enumerate(rows, start=1):
        groups.setdefault(signature(row), []).append(index)
    return {key: indexes for key, indexes in groups.items() if len(indexes) > 1}
