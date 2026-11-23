#!/usr/bin/env python3
"""Draw fixed evaluation sets from the de-duplicated pool.

Each set is four runs of 20 cards, 10 New York and 10 San Francisco.
Runs inside one set do not share a home. The seed is fixed.
"""

import json
import random

from housing import FEATURES, POOL, ROOT, city_from_red, load_rows

SEED = 20261117
SET_COUNT = 20
RUNS = 4
PER_CITY = 10
OUT = ROOT / "public" / "data" / "eval_sets.json"


def feature_names():
    with open(FEATURES, encoding="utf-8") as handle:
        return [feature["column"] for feature in json.load(handle)["features"]]


def public_card(row, names):
    card = {"id": row["index"].strip(), "target": int(row["target"].strip())}
    for name in names:
        card[name] = row[name].strip()
    return card


def main():
    names = feature_names()
    pool = load_rows(POOL)
    new_york = [row for row in pool if city_from_red(row) == "New York"]
    san_francisco = [row for row in pool if city_from_red(row) == "San Francisco"]
    need = RUNS * PER_CITY
    if len(new_york) < need or len(san_francisco) < need:
        raise SystemExit("Evaluation pool is too small for one disjoint set")

    rng = random.Random(SEED)
    sets = {}
    for number in range(1, SET_COUNT + 1):
        ny_pick = rng.sample(new_york, need)
        sf_pick = rng.sample(san_francisco, need)
        runs = []
        for run in range(RUNS):
            cards = (
                ny_pick[run * PER_CITY:(run + 1) * PER_CITY]
                + sf_pick[run * PER_CITY:(run + 1) * PER_CITY]
            )
            rng.shuffle(cards)
            runs.append([public_card(row, names) for row in cards])
        sets[f"E{number:02d}"] = {"runs": runs}

    OUT.write_text(json.dumps(sets, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {SET_COUNT} evaluation sets to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
