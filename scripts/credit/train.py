"""Trains the pre-qualification risk model on UCI Statlog (German Credit Data) and writes
src/fixtures/credit-model.json, which the app scores in TypeScript (src/domain/credit/model.ts).

Only attributes Regentic can honestly fill from bank data are used. Protected attributes and
proxies (A9 personal status and sex, A13 age, A20 foreign worker) are excluded, as are attributes
with no source in our data. Run: python3 scripts/credit/train.py
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict

HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1] / "src" / "fixtures" / "credit-model.json"
COLS = [f"A{i}" for i in range(1, 21)] + ["class"]

CATEGORIES = {
    "A1": ["A11", "A12", "A13", "A14"],
    "A3": ["A30", "A31", "A32", "A33", "A34"],
    "A6": ["A61", "A62", "A63", "A64", "A65"],
}
NUMBERS = ["A2", "A5", "A8", "A16"]
EXCLUDED = ["A9", "A13", "A20", "A4", "A7", "A10", "A11", "A12", "A14", "A15", "A17", "A18", "A19"]

df = pd.read_csv(HERE / "german.data", sep=" ", header=None, names=COLS)
y = (df["class"] == 2).astype(int).to_numpy()  # 1 = bad credit risk

stats = {c: (float(df[c].mean()), float(df[c].std(ddof=0))) for c in NUMBERS}


def encode(row) -> list:
    x = []
    for name, levels in CATEGORIES.items():
        x += [1.0 if row[name] == lv else 0.0 for lv in levels]
    for name in NUMBERS:
        mean, std = stats[name]
        x.append((float(row[name]) - mean) / std)
    return x


X = np.array([encode(r) for _, r in df.iterrows()])
model = LogisticRegression(max_iter=1000)
cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=7)
p_cv = cross_val_predict(model, X, y, cv=cv, method="predict_proba")[:, 1]
model.fit(X, y)
p_all = model.predict_proba(X)[:, 1]

features = [{"name": n, "kind": "category", "levels": lv} for n, lv in CATEGORIES.items()]
features += [{"name": n, "kind": "number", "mean": stats[n][0], "std": stats[n][1]} for n in NUMBERS]

pick = [0, 1, 2, 3, 4]
checks = []
for i in pick:
    r = df.iloc[i]
    inp = {"A1": r["A1"], "A2": int(r["A2"]), "A3": r["A3"], "A5": int(r["A5"]), "A6": r["A6"], "A8": int(r["A8"]), "A16": int(r["A16"])}
    checks.append({"input": inp, "pBad": float(p_all[i])})

out = {
    "dataset": "UCI Statlog (German Credit Data), Hofmann 1994, https://archive.ics.uci.edu/dataset/144",
    "license": "CC BY 4.0",
    "excluded": EXCLUDED,
    # Calibration: map today's typical car loan (~$30,000 over 60 months) onto the dataset's typical
    # car loan (new A40: 3,063 DM over 18.5 months; used A41: 5,370 DM over 26.1 months).
    "dmPerUsd": 0.12,
    "durationScale": 0.4,
    "features": features,
    "weights": [float(w) for w in model.coef_[0]],
    "intercept": float(model.intercept_[0]),
    # The model never declines alone (design decision): it moves the tier and can send to review.
    # The 5:1 cost matrix's break-even (1/6) would refer most applicants because the base bad rate is
    # 30%, so review uses the riskiest fifth instead; costOptimal is kept for reference.
    "thresholds": {
        "tierUp": float(np.percentile(p_all, 20)),
        "tierDown": float(np.percentile(p_all, 80)),
        "review": float(np.percentile(p_all, 80)),
        "costOptimal": 1 / 6,
    },
    "metrics": {
        "auc": round(float(roc_auc_score(y, p_cv)), 3),
        "accuracy": round(float(accuracy_score(y, p_cv >= 0.5)), 3),
        "badRate": round(float(y.mean()), 3),
        "validation": "5-fold stratified cross-validation",
    },
    "checks": checks,
}
OUT.write_text(json.dumps(out, indent=1) + "\n")
print(f"AUC {out['metrics']['auc']} accuracy {out['metrics']['accuracy']} → {OUT.relative_to(HERE.parents[1])}")
