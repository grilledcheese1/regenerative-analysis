# The "Best use of Nessie" moment (stream 2)

**Claim:** banking data read live from the Capital One Nessie sandbox changes the vehicle budget, and through it the recommendation. Unit test B11 (`tests/banking/seed.test.ts`) proves the effect for Maria: −$300/mo, and a different result.

## Before the demo (once)

- `.env.local` has `NESSIE_API_KEY` and the `NESSIE_CUSTOMERS` line produced by the seed route. Those are already set on the dev machine as of 2026-10-24.
- `npm run build && npm run start`, then open `/next-move` with Maria selected.
- Check that **Sync from Nessie sandbox** → header "Banking · Nessie sandbox" → Money shows **Vehicle budget $900**, the same as the fixture, because the sandbox was seeded from it.

## Live, on stage (about 40 s)

1. Money: point at income − other spending − savings goal − buffer = **$900**, read live from Nessie (show the "retrieved {time}" status).
2. In a terminal, add a $300/month childcare bill to Maria's checking account in Nessie. The budget uses the last three complete months (Jul–Sep 2026), so add one per month:

   ```bash
   KEY=$(grep '^NESSIE_API_KEY=' .env.local | cut -d= -f2)
   MARIA=$(grep '^NESSIE_CUSTOMERS=' .env.local | tr ',' '\n' | grep maria | cut -d: -f2)
   CHK=$(curl -s "https://api.nessieisreal.com/customers/$MARIA/accounts?key=$KEY" \
     | python3 -c 'import json,sys; print(next(a["_id"] for a in json.load(sys.stdin) if a["type"]=="Checking"))')
   for m in 07 08 09; do
     curl -s -X POST "https://api.nessieisreal.com/accounts/$CHK/bills?key=$KEY" -H 'content-type: application/json' \
       -d "{\"status\":\"completed\",\"payee\":\"Childcare\",\"nickname\":\"Childcare\",\"payment_date\":\"2026-$m-20\",\"recurring_date\":20,\"payment_amount\":300}"
     echo
   done
   ```

   Keep `recurring_date` in the body: a bill without it breaks Nessie's bill list for the whole account.
3. Back in the app: **Sync from Nessie sandbox** again. The vehicle budget drops to **$600** and the comparison changes on Compare and Next Move.
4. Line: *"Nessie isn't decoration here: the bank data is the budget, and the budget picks the next move."*

## Undo (after the demo, so Maria is back to $900)

```bash
curl -s "https://api.nessieisreal.com/accounts/$CHK/bills?key=$KEY" \
  | python3 -c 'import json,sys; [print(b["_id"]) for b in json.load(sys.stdin) if b["payee"]=="Childcare"]' \
  | while read id; do curl -s -o /dev/null -w "deleted $id %{http_code}\n" -X DELETE "https://api.nessieisreal.com/bills/$id?key=$KEY"; done
```

## If Nessie is down on stage

The sync fails with a visible error and keeps the earlier data. Click **Use last sandbox read (time)**, which is labeled stale, or use the fixture fallback: Money → move "New monthly expense" to $300. The effect is identical and honestly labeled as a scenario control.
