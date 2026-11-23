#!/usr/bin/env python3
"""Train the two Group 1 opponents and write them as data.

The overfitted tree is fit on the 20 Group 1 cards and the five published
features. The human-guided tree is the original lesson rule, price per sq ft
then elevation, because a depth-limited fit on these cards splits on year
built instead. Thresholds are snapped to the midpoint between neighbouring
card values. Prints a warning if the overfitted tree does not beat the
human-guided tree on the pack and lose to it on the evaluation pool.
"""

import json
import sys

import numpy as np
from sklearn.tree import DecisionTreeClassifier

from housing import FEATURES, POOL, ROOT, city_from_red, load_rows

SEED = 20261117
OUT_JSON = ROOT / "public" / "data" / "opponents" / "group1.json"
OUT_TXT = ROOT / "public" / "data" / "opponents" / "group1.txt"
PACK = ROOT / "public" / "data" / "pack.json"


def feature_names():
    with open(FEATURES, encoding="utf-8") as handle:
        return [feature["column"] for feature in json.load(handle)["features"]]


def clean_number(value):
    rounded = round(float(value), 6)
    if abs(rounded - round(rounded)) < 1e-9:
        return int(round(rounded))
    return rounded


def snap(values, threshold):
    unique = sorted(set(values))
    below = [value for value in unique if value <= threshold + 1e-9]
    above = [value for value in unique if value > threshold + 1e-9]
    if not below or not above:
        return clean_number(threshold)
    return clean_number((below[-1] + above[0]) / 2.0)


def export_tree(model, names, columns):
    tree = model.tree_

    def walk(index):
        if tree.feature[index] < 0:
            counts = tree.value[index][0]
            class_index = int(np.argmax(counts))
            city = "San Francisco" if int(model.classes_[class_index]) == 1 else "New York"
            return {"leaf": city}
        feature_index = int(tree.feature[index])
        name = names[feature_index]
        threshold = snap(columns[name], float(tree.threshold[index]))
        return {
            "feature": name,
            "threshold": threshold,
            "left": walk(int(tree.children_left[index])),
            "right": walk(int(tree.children_right[index])),
        }

    return walk(0)


def predict(node, card):
    while "leaf" not in node:
        if float(card[node["feature"]]) <= node["threshold"]:
            node = node["left"]
        else:
            node = node["right"]
    return node["leaf"]


def score(node, cards, city_of):
    if not cards:
        return 0
    correct = sum(1 for card in cards if predict(node, card) == city_of(card))
    return int(round(100.0 * correct / len(cards)))


def rules(node, depth=0):
    indent = "  " * depth
    if "leaf" in node:
        return f"{indent}predict {node['leaf']}"
    feature = node["feature"]
    threshold = node["threshold"]
    return "\n".join([
        f"{indent}if {feature} <= {threshold}:",
        rules(node["left"], depth + 1),
        f"{indent}else:",
        rules(node["right"], depth + 1),
    ])


def fit(name, matrix, labels, names, columns, settings):
    model = DecisionTreeClassifier(random_state=SEED, **settings)
    model.fit(matrix, labels)
    return export_tree(model, names, columns)


def main():
    names = feature_names()
    pack = json.loads(PACK.read_text(encoding="utf-8"))["cards"]
    matrix = np.array([[float(card[name]) for name in names] for card in pack], dtype=float)
    labels = np.array([1 if card["city"] == "San Francisco" else 0 for card in pack])
    columns = {name: [float(card[name]) for card in pack] for name in names}

    overfitted = fit("overfitted", matrix, labels, names, columns, {"min_samples_leaf": 1})
    # The original human-guided rule. A depth-2 fit prefers year built here.
    guided = {
        "feature": "price_per_sqft",
        "threshold": snap(columns["price_per_sqft"], 875),
        "left": {"leaf": "San Francisco"},
        "right": {
            "feature": "elevation",
            "threshold": snap(columns["elevation"], 28),
            "left": {"leaf": "New York"},
            "right": {"leaf": "San Francisco"},
        },
    }

    pool = load_rows(POOL)
    opponents = {
        "overfitted": {
            "confidence": score(overfitted, pack, lambda card: card["city"]),
            "tree": overfitted,
        },
        "humanGuided": {
            "confidence": score(guided, pack, lambda card: card["city"]),
            "tree": guided,
        },
    }
    over_train = opponents["overfitted"]["confidence"]
    human_train = opponents["humanGuided"]["confidence"]
    over_eval = score(overfitted, pool, city_from_red)
    human_eval = score(guided, pool, city_from_red)
    opponents["overfitted"]["evaluationScore"] = over_eval
    opponents["humanGuided"]["evaluationScore"] = human_eval

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(opponents, indent=2) + "\n", encoding="utf-8")

    over_gap = abs(over_train - over_eval)
    human_gap = abs(human_train - human_eval)
    report = "\n\n".join([
        "A run is won by whoever is closer to their own claim, not by the higher percentage correct.",
        "Overfitted machine",
        f"Training score, and the claim: {over_train}%",
        f"Evaluation pool score: {over_eval}%",
        f"Off its claim: {over_gap} percentage points",
        "Its extra splits use year built. That rule behaves as if one city stopped building, which is why it fails away from the 20 cards.",
        rules(overfitted),
        "Human-guided machine",
        f"Training score, and the claim: {human_train}%",
        f"Evaluation pool score: {human_eval}%",
        f"Off its claim: {human_gap} percentage points",
        "Uses price per sq ft and elevation only.",
        rules(guided),
        "",
    ])
    OUT_TXT.write_text(report, encoding="utf-8")
    print(report)
    if over_train > human_train and over_gap > human_gap:
        print("Opponent check passed")
        return 0
    print(
        "Opponent check: the overfitted tree should claim more on the 20 cards "
        f"({over_train}% vs {human_train}%) and miss that claim by more on the pool "
        f"({over_gap} points vs {human_gap} points)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
