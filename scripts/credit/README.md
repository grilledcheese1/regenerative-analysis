# Credit model

`train.py` fits the pre-qualification risk model on UCI Statlog (German Credit Data)
(`german.data`, 1,000 applicants, CC BY 4.0, https://archive.ics.uci.edu/dataset/144) and writes
`src/fixtures/credit-model.json`. The app scores that JSON in TypeScript; Python is only needed to retrain.

```bash
python3 scripts/credit/train.py   # needs scikit-learn and pandas
```

Features: A1 checking status, A2 duration, A3 credit history, A5 amount, A6 savings, A8 installment rate,
A16 existing credits. Excluded: A9 personal status and sex, A13 age, A20 foreign worker (protected or proxies)
and the attributes with no source in bank data.
