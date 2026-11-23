#!/usr/bin/env python3
"""Check that every training and evaluation row traces to the R2D3 source.

Exits 0 when every houses.csv and red_cards.csv row matches a source row on
the seven feature fields and the city, and the generated evaluation pool has
no training home and no duplicate listing.
"""

import sys

from housing import (
    HOUSES,
    POOL,
    REDS,
    city_from_red,
    city_from_source,
    duplicate_groups,
    has_bom,
    index_signatures,
    load_rows,
    load_source,
    signature,
)


def unmatched(rows, source_index, city_of, label):
    missing = []
    for number, row in enumerate(rows, start=1):
        key = (signature(row), city_of(row))
        if key not in source_index:
            missing.append(number)
    print(f"{label}: {len(rows)} rows, {len(rows) - len(missing)} matched, {len(missing)} unmatched")
    if missing:
        preview = ", ".join(str(number) for number in missing[:20])
        print(f"  unmatched row numbers: {preview}")
    return missing


def main():
    source = load_source()
    houses = load_rows(HOUSES)
    reds = load_rows(REDS)
    source_index = index_signatures(source, city_from_source)

    print(f"source rows: {len(source)}")
    print(f"red_cards.csv UTF-8 BOM: {'yes' if has_bom(REDS) else 'no'}")

    missing = []
    missing += unmatched(houses, source_index, lambda row: row["city"], "houses.csv")
    missing += unmatched(reds, source_index, city_from_red, "red_cards.csv")

    house_dupes = duplicate_groups(houses)
    red_dupes = duplicate_groups(reds)
    extra_red = sum(len(indexes) - 1 for indexes in red_dupes.values())
    print(f"training duplicate listings: {len(house_dupes)} signatures, left unchanged")
    print(f"evaluation duplicate listings: {len(red_dupes)} signatures, {extra_red} extra rows")

    train_signatures = {signature(row) for row in houses}
    overlap = [number for number, row in enumerate(reds, start=1) if signature(row) in train_signatures]
    print(f"evaluation rows that duplicate a training home: {len(overlap)}")

    if not POOL.exists():
        print("evaluation pool is missing. Run scripts/build_evaluation_pool.py")
        return 1

    pool = load_rows(POOL)
    pool_signatures = [signature(row) for row in pool]
    pool_overlap = [signature for signature in pool_signatures if signature in train_signatures]
    pool_dupes = len(pool_signatures) - len(set(pool_signatures))
    print(f"evaluation pool rows: {len(pool)}")
    print(f"evaluation pool rows that duplicate training: {len(pool_overlap)}")
    print(f"evaluation pool internal duplicates: {pool_dupes}")

    if missing or pool_overlap or pool_dupes:
        print("provenance check failed")
        return 1
    print("provenance check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
