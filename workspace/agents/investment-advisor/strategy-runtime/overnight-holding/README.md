# Overnight Holding Runtime

This runtime supports a **virtual-only** overnight-holding research workflow for
`investment-advisor`.

## Phases

- **T day 14:30**: run candidate selection and record virtual buys
- **T+1 09:35+**: review sell decisions every 5 minutes until exit

## Guardrails

- virtual buy only
- virtual sell review only
- no real order placement
- no broker execution

## CLI entrypoints

```bash
node strategy-runtime/overnight-holding/cli/run-selection.mjs --tradingDate 2026-03-12 --variant both --dryRun true
node strategy-runtime/overnight-holding/cli/run-sell-review.mjs --tradingDate 2026-03-13 --source previous-selection --dryRun true
```
