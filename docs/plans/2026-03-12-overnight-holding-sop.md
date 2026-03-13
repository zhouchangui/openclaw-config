# Overnight Holding SOP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a virtual overnight-holding workflow for `investment-advisor` that selects candidates at 14:30, records simulated buys, evaluates sell decisions every 5 minutes after 09:35 the next day, and only operates in market regimes suitable for a strong-continuation strategy.

**Architecture:** Keep this separate from the existing report-generation flow. Add a small `strategy-runtime/overnight-holding/` source tree with pure rule modules, fixtures, smoke tests, and two CLI entrypoints: one for T-day selection and one for T+1 sell review. Add a persistent state/record layer for buy logs, current virtual positions, selection journals, sell-review journals, and stop-state transitions. Wire the workflow into a new skill and agent docs, but keep it explicitly virtual-only: no real order placement, no broker integration, no auto-trading language.

**Tech Stack:** Node.js ESM, existing OpenClaw workspace conventions, Markdown skill docs, JSON fixtures, smoke-test pattern used by `report-runtime`

## Reference Mapping: `overnight_holding_agent_rebuild`

Reference path:
`/Users/zcg/workroot/LeeksAlly/backend/app/agents/overnight_holding_agent_rebuild`

Use it as a structural reference, not as the source of truth.

### Reuse directly

- `market_analyzer.py`
  - Reuse the idea of a dedicated market gate before any stock selection.
  - Reuse the separation between market data collection and strategy judgment.

- `stock_selector.py`
  - Reuse the staged workflow shape: candidate pool → refinement → final selection.
  - Reuse the notion that final selection should be validated and have a deterministic fallback.

- `prompts.py`
  - Reuse the observation dimensions only: hotspot direction, fund flow, overnight safety, sector focus.

### Reuse with modification

- Fundamental analysis / `buy_rating`
  - Keep only as a weak auxiliary factor.
  - In this project, sector continuity and next-day sellability should dominate.

- Industry diversification
  - Keep as a soft constraint only.
  - For this SOP, concentrated main-theme exposure is acceptable when the theme is clear.

- Risk-control phrasing
  - Rewrite into virtual-research language.
  - Do not carry over real-trading semantics such as actual position management or broker execution.

### Do not copy

- Heavy LLM dependence for final trading decisions
  - Prefer explicit rules first, with LLM used only for explanation or summarization if needed.

- Real trading / execution semantics
  - No real order placement, no account execution, no stop-loss automation.

- Long-horizon growth-stock logic overpowering short-cycle continuation
  - This SOP is about T-day momentum continuation into T+1 morning, not medium-term growth investing.

### Design priority for this implementation

When the reference conflicts with our design, follow this priority:

1. Market-regime gate
2. Sector continuity
3. Leader vs mid-core split
4. T+1 09:35+ 5-minute sell review cadence
5. Fundamental or style preference as a secondary filter

### Additional operating requirements from user discussion

- Persist the following records across days:
  - virtual buy records
  - current virtual positions
  - daily selection process logs
  - detailed sell-analysis logs
- Add a user-controlled stop switch that explicitly disables strategy execution.
- When market regime is not tradable, the workflow must proactively stop execution and record that stop event.
- When market regime later improves again, the workflow must **not** auto-resume buying.
- Before resuming from a stopped state caused by user pause or market shutdown, send a Feishu confirmation request asking whether the user wants to restart the strategy.
- Virtual buy / sell-review must be exposed through a dedicated **trading skill** entrypoint, not only as CLI commands.

---

### Task 1: Align agent scope for virtual strategy research

**Files:**
- Modify: `workspace/agents/investment-advisor/AGENTS.md`
- Modify: `workspace/agents/investment-advisor/INVESTMENT_WORKFLOW.md`
- Modify: `workspace/agents/investment-advisor/MEMORY.md`
- Modify: `workspace/agents/investment-advisor/skills/README.md`

**Step 1: Add a failing documentation assertion checklist**

Create a temporary checklist in the commit message draft or local notes requiring:
- mentions “virtual buy” / “virtual sell”
- forbids real order placement
- introduces `overnight-holding` as a research workflow, not auto-trading

**Step 2: Verify current docs fail the checklist**

Run:
```bash
cd /Users/zcg/.openclaw
rg -n "overnight-holding|虚拟买入|虚拟卖出" workspace/agents/investment-advisor
```

Expected: no complete overnight-holding workflow references yet.

**Step 3: Update minimal scope docs**

Add one new route in `AGENTS.md`:
- `隔日持股研究 / 次日卖出复盘` → `overnight-holding`

Update `INVESTMENT_WORKFLOW.md` and `MEMORY.md` to clarify:
- still no auto-trading
- virtual research workflows are allowed
- this SOP studies T-day selection + T+1 execution review only

**Step 4: Re-run grep**

Run:
```bash
rg -n "overnight-holding|虚拟买入|虚拟卖出" workspace/agents/investment-advisor
```

Expected: the new route and scope text are present.

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/AGENTS.md \
  workspace/agents/investment-advisor/INVESTMENT_WORKFLOW.md \
  workspace/agents/investment-advisor/MEMORY.md \
  workspace/agents/investment-advisor/skills/README.md
git commit -m "docs: define virtual overnight workflow scope"
```

---

### Task 2: Create the overnight-holding runtime skeleton

**Files:**
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/README.md`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/cli/run-selection.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/cli/run-sell-review.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/io.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/schema-checks.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/runtime-foundation.smoke.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/fixtures/README.md`

**Step 1: Write the failing smoke**

In `runtime-foundation.smoke.mjs`, assert that:
- both CLI files exist
- `schema-checks.mjs` exports validation helpers
- README mentions `14:30` and `09:35`

**Step 2: Run it to verify it fails**

Run:
```bash
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/runtime-foundation.smoke.mjs
```

Expected: FAIL because files do not exist yet.

**Step 3: Add the minimal skeleton**

Create stubs that:
- parse CLI flags
- expose `validateSelectionInput()` and `validateSellReviewInput()`
- document expected inputs/outputs

**Step 4: Run the smoke again**

Expected: PASS.

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/strategy-runtime/overnight-holding
git commit -m "feat: scaffold overnight holding runtime"
```

---

### Task 3: Implement the market-regime gate with sector continuity

**Files:**
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/market-regime.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/fixtures/market-regime.{good,bad,rotation}.json`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/market-regime.smoke.mjs`

**Step 1: Write the failing smoke**

Test three cases:
- `good`: main theme clear, afternoon stable, sector continuity high → `tradable: true`
- `rotation`: leaders rotate too fast → `tradable: false`
- `bad`: broad afternoon weakness → `tradable: false`

Example expected shape:
```js
assert.equal(result.tradable, true)
assert.ok(result.sectorContinuityScore >= 70)
```

**Step 2: Run the smoke**

Expected: FAIL because `market-regime.mjs` is missing.

**Step 3: Implement minimal rules**

Rules should explicitly score:
- main-theme clarity
- sector breadth concentration
- afternoon strength retention
- core-leader confirmation

Also return:
- `tradable`
- `sectorContinuityScore`
- `reasons`
- `warnings`

**Step 4: Re-run smoke**

Expected: PASS for all fixtures.

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/market-regime.mjs \
  workspace/agents/investment-advisor/strategy-runtime/overnight-holding/fixtures \
  workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/market-regime.smoke.mjs
git commit -m "feat: add overnight market regime gate"
```

---

### Task 4: Implement candidate scoring for 龙头版 and 中军版

**Files:**
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/score-candidates.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/fixtures/candidates.sample.json`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/candidate-scoring.smoke.mjs`

**Step 1: Write the failing smoke**

Cover:
- leader candidate wins because it has stronger theme leadership
- mid-cap/core candidate wins because it has stronger liquidity + stability
- a strong stock is rejected when `sectorContinuityScore` is below threshold

**Step 2: Run smoke**

Expected: FAIL.

**Step 3: Implement minimal scoring**

Use a shared 100-point model:
- sector continuity: 35
- stock strength: 30
- afternoon support: 20
- next-day realizability: 15

Then layer two profiles:
- `leader`: more weight on board position / emotional leadership
- `midcore`: more weight on liquidity / trend integrity / next-day sellability

Return:
- `variant`
- `totalScore`
- `rejectReason`
- `selectionReasons`

**Step 4: Re-run smoke**

Expected: PASS.

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/score-candidates.mjs \
  workspace/agents/investment-advisor/strategy-runtime/overnight-holding/fixtures/candidates.sample.json \
  workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/candidate-scoring.smoke.mjs
git commit -m "feat: add overnight candidate scoring"
```

---

### Task 4.5: Add persistent state and execution journals

**Files:**
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/state-store.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/state-store.smoke.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/fixtures/state.sample.json`

**Step 1: Write the failing smoke**

Assert the state layer can persist and reload:
- `virtualBuys`
- `currentPositions`
- `selectionJournal`
- `sellReviewJournal`
- `stopEvents`

Also require append-only event logging for:
- selection run start/end
- market-stop trigger
- user-stop toggle
- sell-review decision snapshots

**Step 2: Run smoke**

Expected: FAIL.

**Step 3: Implement minimal state store**

Use local JSON files under a dedicated strategy path, for example:
- `data/overnight-holding/state.json`
- `data/overnight-holding/journals/YYYY-MM-DD.selection-log.json`
- `data/overnight-holding/journals/YYYY-MM-DD.sell-review-log.json`

The API should support:
- load state
- save state
- append journal event
- record stop / resume intent

**Step 4: Re-run smoke**

Expected: PASS.

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/state-store.mjs \
  workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/state-store.smoke.mjs \
  workspace/agents/investment-advisor/strategy-runtime/overnight-holding/fixtures/state.sample.json
git commit -m "feat: persist overnight state and journals"
```

---

### Task 5: Build the T-day virtual-buy selection pipeline

**Files:**
- Modify: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/cli/run-selection.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/build-selection-package.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-cli.smoke.mjs`

**Step 1: Write the failing smoke**

The CLI should:
- accept `--tradingDate`
- accept `--variant leader|midcore|both`
- emit JSON with `marketGate`, `selectedCandidates`, `virtualBuys`, `messageSummary`

Expected `messageSummary` example:
```json
{
  "ok": true,
  "phase": "selection",
  "tradable": true
}
```

**Step 2: Run smoke**

Expected: FAIL due to missing output contract.

**Step 3: Implement minimal pipeline**

Wire:
- input validation
- market-regime gate
- candidate scoring
- top-N virtual buys
- persistent logging of the full selection process
- current virtual position updates when a virtual buy is accepted

Keep persistence local-only:
- `data/overnight-holding/YYYY-MM-DD.selection.json`
- `reports/overnight-holding/YYYY-MM-DD.selection.md`
- `data/overnight-holding/journals/YYYY-MM-DD.selection-log.json`

**Step 4: Re-run smoke**

Expected: PASS.

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/strategy-runtime/overnight-holding/cli/run-selection.mjs \
  workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/build-selection-package.mjs \
  workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-cli.smoke.mjs
git commit -m "feat: add overnight selection pipeline"
```

---

### Task 6: Implement the T+1 sell-review engine

**Files:**
- Modify: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/cli/run-sell-review.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/sell-decision.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/sell-decision.smoke.mjs`

**Step 1: Write the failing smoke**

Cover:
- weak open / failed reclaim → `action: sell_now`
- meets expectation but not super-strong → `action: sell_on_first_push`
- clear one-way trend + volume support → `action: hold_and_recheck`

Also assert time cadence:
- valid checkpoints begin after `09:35`
- decisions can be evaluated every 5 minutes
- default liquidation target is before noon

**Step 2: Run smoke**

Expected: FAIL.

**Step 3: Implement minimal sell rules**

Return:
- `action`
- `confidence`
- `nextCheckAt`
- `why`
- `mustExitBefore`

Hard rules:
- default: prioritize realized gains
- only delay exit when trend is one-way up and volume confirms
- do not allow holding into a second overnight cycle
- persist every 5-minute review step into a sell-review journal
- default target remains full exit before noon

**Step 4: Re-run smoke**

Expected: PASS.

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/strategy-runtime/overnight-holding/cli/run-sell-review.mjs \
  workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/sell-decision.mjs \
  workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/sell-decision.smoke.mjs
git commit -m "feat: add overnight sell review rules"
```

---

### Task 7: Wire the workflow into the agent skill layer

**Files:**
- Create: `workspace/agents/investment-advisor/skills/trading/SKILL.md`
- Optional compatibility shim: `workspace/agents/investment-advisor/skills/overnight-holding/SKILL.md`
- Modify: `workspace/agents/investment-advisor/AGENTS.md`
- Modify: `workspace/agents/investment-advisor/skills/README.md`
- Modify: `workspace/agents/investment-advisor/report-specs/task-wiring.md`

**Step 1: Write a failing smoke**

Create:
- `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/skill-wiring.smoke.mjs`

Assert:
- trading skill references `run-selection.mjs`
- trading skill references `run-sell-review.mjs`
- `task-wiring.md` documents `14:30` and `09:35`
- wording says virtual-only, no real trade execution
- wording documents a user stop switch
- wording documents market-driven auto-stop
- wording documents Feishu restart confirmation before resuming buys

**Step 2: Run smoke**

Expected: FAIL.

**Step 3: Write the skill**

The trading skill should define:
- when to use
- required inputs
- output contract
- “don’t do real trading” guardrail
- action-based entrypoints, for example:
  - `buy`
  - `sell-review`
  - `status`
  - `stop`
  - `resume-request`
- a user stop toggle / strategy status mode
- a resume flow that asks the user in Feishu before reactivating

**Step 4: Re-run smoke**

Expected: PASS.

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/skills/trading/SKILL.md \
  workspace/agents/investment-advisor/AGENTS.md \
  workspace/agents/investment-advisor/skills/README.md \
  workspace/agents/investment-advisor/report-specs/task-wiring.md \
  workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/skill-wiring.smoke.mjs
git commit -m "feat: wire overnight trading skill"
```

---

### Task 8: Run full verification and capture rollout notes

**Files:**
- Modify: `workspace/agents/investment-advisor/MEMORY.md`
- Modify: `workspace/agents/investment-advisor/memory/YYYY-MM-DD.md` (current day only, if this workflow is actually implemented and exercised)

**Step 1: Run all overnight-holding smokes**

Run:
```bash
cd /Users/zcg/.openclaw
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/runtime-foundation.smoke.mjs
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/market-regime.smoke.mjs
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/candidate-scoring.smoke.mjs
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-cli.smoke.mjs
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/sell-decision.smoke.mjs
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/skill-wiring.smoke.mjs
```

Expected: all PASS.

**Step 2: Dry-run both phases**

Run:
```bash
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/cli/run-selection.mjs --tradingDate 2026-03-12 --variant both --dryRun true
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/cli/run-sell-review.mjs --tradingDate 2026-03-13 --source previous-selection --dryRun true
```

Expected: both commands return structured JSON with no real order side effects.

**Step 3: Record rollout note**

Only after code exists and dry-runs pass, add a short note to `MEMORY.md`:
- suitable market regime
- unsuitable market regime
- difference between leader and midcore variant

**Step 4: Final commit**

```bash
git add workspace/agents/investment-advisor
git commit -m "test: verify overnight holding workflow"
```
