# Failure-state screenshots

Captured against a production build with no provider keys (`next start`), desktop 1200 px.

| Failure | Screenshot | Status |
| --- | --- | --- |
| Nessie not configured | `01-nessie-not-configured.png` | Fixture labeled in the header and sync bar; "Sync from Nessie sandbox" is disabled. The reason is only a hover tooltip today (stream 2's `BankingSyncBar`) |
| Map unavailable | `02-map-unavailable.png` | Static route preview plus "Map tiles unavailable" |
| AI not configured | `03-ai-not-configured.png` | "Template explanation (AI explanation unavailable: not configured)" |
| No feasible option | `04-no-feasible-option-kai.png` | Kai: "No option fits these constraints" |
| Deleted data | `05-…dialog.png`, `06-after-delete-app-works.png` | Confirm dialog, then the app reloads the fixture and keeps working |
| Nessie down after a good read | n/a | Needs live sandbox credentials (stream 2) |
| AI out of credit or erroring | n/a | Needs a valid key on an account without credit |
| Market unavailable | n/a (not merged) | Stream 3 |
| Import rejected | n/a (not merged) | Stream 1 |
