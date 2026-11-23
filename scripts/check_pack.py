#!/usr/bin/env python3
"""Compare Group 1 with the evaluation pool on the five published features."""

import json
from collections import defaultdict

from housing import FEATURES, HOUSES, POOL, city_from_red, load_rows


def columns():
    with open(FEATURES, encoding="utf-8") as handle:
        return [feature["column"] for feature in json.load(handle)["features"]]


def percentile(sorted_values, fraction):
    if not sorted_values:
        return None
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = (len(sorted_values) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(sorted_values) - 1)
    weight = position - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


def summarise(rows, column):
    values = sorted(float(row[column]) for row in rows)
    return {
        "n": len(values),
        "min": values[0],
        "q1": percentile(values, 0.25),
        "median": percentile(values, 0.5),
        "q3": percentile(values, 0.75),
        "max": values[-1],
    }


def by_city(rows, city_of):
    grouped = defaultdict(list)
    for row in rows:
        grouped[city_of(row)].append(row)
    return grouped


def cell(summary, key):
    value = summary[key]
    if isinstance(value, float):
        return f"{value:.1f}"
    return str(value)


def main():
    houses = [row for row in load_rows(HOUSES) if (row.get("group") or "").strip() == "1"]
    pool = load_rows(POOL)
    pack = by_city(houses, lambda row: row["city"])
    evaluation = by_city(pool, city_from_red)
    header = f"{'feature':<16} {'set':<12} {'city':<16} {'n':>4} {'min':>10} {'q1':>10} {'median':>10} {'q3':>10} {'max':>10}"
    print(header)
    for column in columns():
        for label, grouped in (("Group 1", pack), ("Evaluation", evaluation)):
            for city in ("New York", "San Francisco"):
                summary = summarise(grouped[city], column)
                print(
                    f"{column:<16} {label:<12} {city:<16} {summary['n']:>4} "
                    f"{cell(summary, 'min'):>10} {cell(summary, 'q1'):>10} "
                    f"{cell(summary, 'median'):>10} {cell(summary, 'q3'):>10} {cell(summary, 'max'):>10}"
                )


if __name__ == "__main__":
    main()
