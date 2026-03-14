# Overnight Holding Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor `investment-advisor` overnight-holding into a simpler chain: full-market technical screening with real data, LLM refinement on <=50 candidates, final risk-veto review, then trading execution.

**Architecture:** Keep the `trading` skill entrypoint and current artifact contract, but replace the fixed-basket / multi-layer scoring path with a clearer pipeline. Selection should become `whole-market data fetch -> technical prefilter -> LLM selection -> final risk veto -> execution`, using `Tushare -> Akshare -> web` fallback order and recording every fallback explicitly in audit lineage.

**Tech Stack:** Node.js ESM CLI runtime, Python data collectors, Tushare, Akshare, existing OpenClaw agent prompt path, JSON audit/state persistence, smoke-style Node tests.

---

### Task 1: Lock the new architecture in failing tests

**Files:**
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/full-market-screening.smoke.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/final-risk-veto.smoke.mjs`
- Modify: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-live-provider.smoke.mjs`
- Test: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/*.smoke.mjs`

**Step 1: Write the failing test**

```javascript
assert.equal(result.prefilterSummary.scope, 'full-market');
assert.equal(result.prefilterSummary.technicalCandidatesCount <= 50, true);
assert.equal(result.riskReview.decision, 'ask_user_first');
assert.equal(result.executionLog.length, 0);
```

**Step 2: Run test to verify it fails**

Run: `node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/full-market-screening.smoke.mjs`

Expected: FAIL because the current runtime still uses the fixed candidate basket and has no final risk-veto stage.

**Step 3: Write minimal implementation**

Do not implement behavior yet. Only add the test fixtures and assertions that describe:

- full-market technical prefilter summary
- `<=50` candidate cap before LLM
- final risk review result shape
- explicit fallback order metadata

**Step 4: Run test to verify it passes**

Not applicable yet. This task is only complete when the new tests fail for the expected reason.

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke
git commit -m "test: lock overnight holding rewrite behavior"
```

### Task 2: Replace fixed-basket live input with full-market technical screening

**Files:**
- Modify: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/live-selection-inputs.mjs`
- Modify: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/python/build_live_selection_inputs.py`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/technical-prefilter.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/python/build_full_market_snapshot.py`
- Test: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/full-market-screening.smoke.mjs`

**Step 1: Write the failing test**

```javascript
assert.equal(result.inputDataSource.provider, 'tushare');
assert.equal(result.prefilterSummary.scope, 'full-market');
assert.equal(result.prefilterSummary.technicalCandidatesCount <= 50, true);
assert.ok(result.prefilterSummary.filters.includes('overnight-holding-technical'));
```

**Step 2: Run test to verify it fails**

Run: `node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/full-market-screening.smoke.mjs`

Expected: FAIL because the current provider only pulls a fixed symbol basket.

**Step 3: Write minimal implementation**

Implement a real-data full-market screening stage that:

- fetches full-market rows from `Tushare`
- falls back to `Akshare`
- falls back to web only if both fail
- drops ST / halted / invalid rows
- calculates a small overnight-holding-focused technical feature set
- keeps only the top `<=50` candidates before the LLM stage

Return structured metadata:

```javascript
{
  marketSnapshot,
  candidateSnapshot,
  prefilterSummary: {
    scope: 'full-market',
    rawUniverseCount,
    tradableUniverseCount,
    technicalCandidatesCount,
    filters: ['overnight-holding-technical']
  }
}
```

**Step 4: Run test to verify it passes**

Run: `node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/full-market-screening.smoke.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib workspace/agents/investment-advisor/strategy-runtime/overnight-holding/python workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke
git commit -m "feat: add full-market overnight prefilter"
```

### Task 3: Add final risk-veto review contract

**Files:**
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/risk-veto-review.mjs`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/fixtures/risk-veto.agent-allow.sample.json`
- Create: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/fixtures/risk-veto.agent-veto.sample.json`
- Test: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/final-risk-veto.smoke.mjs`

**Step 1: Write the failing test**

```javascript
assert.equal(result.riskReview.decision, 'veto');
assert.equal(result.virtualBuys.length, 0);
assert.equal(result.executionLog[0].reason, 'risk_veto');
```

**Step 2: Run test to verify it fails**

Run: `node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/final-risk-veto.smoke.mjs`

Expected: FAIL because no final risk-veto review exists yet.

**Step 3: Write minimal implementation**

Implement a dedicated final review step that receives:

- preselected stocks
- market snapshot
- current strategy state
- user guidance / notes
- AKShare news summary and negative flags

It should return one of:

- `allow`
- `reduce`
- `ask_user_first`
- `veto`

And it must not alter the earlier screening process. It only affects the final execution step.

**Step 4: Run test to verify it passes**

Run: `node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/final-risk-veto.smoke.mjs`

Expected: PASS

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/risk-veto-review.mjs workspace/agents/investment-advisor/strategy-runtime/overnight-holding/fixtures workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/final-risk-veto.smoke.mjs
git commit -m "feat: add overnight final risk veto review"
```

### Task 4: Refactor selection orchestration to the simplified pipeline

**Files:**
- Modify: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/build-selection-package.mjs`
- Modify: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/agent-decision.mjs`
- Modify: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/portfolio.mjs`
- Test: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-agent-llm.smoke.mjs`
- Test: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-cli.smoke.mjs`

**Step 1: Write the failing test**

```javascript
assert.equal(result.prefilterSummary.technicalCandidatesCount <= 50, true);
assert.equal(result.riskReview.decision, 'allow');
assert.equal(result.virtualBuys.length > 0, true);
```

**Step 2: Run test to verify it fails**

Run: `node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-agent-llm.smoke.mjs`

Expected: FAIL because the current flow still uses old scoring-centric candidate construction and has no risk-veto stage.

**Step 3: Write minimal implementation**

Refactor selection into this order:

1. load state
2. resolve real data
3. apply technical prefilter to full market
4. ask LLM to refine and rank within `<=50`
5. run final risk-veto review
6. only then mutate state / execute virtual buys

Keep these existing outward contracts stable where practical:

- `trading` skill entrypoint
- `selection.json`
- `audit/<date>.json`
- summary message structure

**Step 4: Run test to verify it passes**

Run:

```bash
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-cli.smoke.mjs
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-agent-llm.smoke.mjs
```

Expected: PASS

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke
git commit -m "refactor: simplify overnight selection flow"
```

### Task 5: Update docs and skill contract to match the new architecture

**Files:**
- Modify: `workspace/agents/investment-advisor/strategy-runtime/overnight-holding/README.md`
- Modify: `workspace/agents/investment-advisor/skills/trading/SKILL.md`
- Test: documentation only

**Step 1: Write the failing test**

For docs, the failing test is a doc/spec mismatch review:

- README still describes the old fixed-basket and scoring-heavy flow
- SKILL contract does not mention final risk-veto review clearly enough

**Step 2: Run test to verify it fails**

Manual check:

- README missing simplified pipeline
- SKILL missing explicit final risk-veto stage

**Step 3: Write minimal implementation**

Update both documents to describe:

- `Tushare -> Akshare -> web`
- whole-market technical prefilter
- `<=50` candidate cap before LLM
- final risk-veto review with news and user guidance
- execution only after veto review passes

**Step 4: Run test to verify it passes**

Manual verification that README and SKILL match actual code behavior.

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/strategy-runtime/overnight-holding/README.md workspace/agents/investment-advisor/skills/trading/SKILL.md
git commit -m "docs: update overnight holding architecture"
```

### Task 6: Run full verification for the rewritten chain

**Files:**
- Test only

**Step 1: Write the failing test**

No new test file. This task verifies the integrated system.

**Step 2: Run test to verify baseline issues are gone**

Run:

```bash
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/full-market-screening.smoke.mjs
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/final-risk-veto.smoke.mjs
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-live-provider.smoke.mjs
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-cli.smoke.mjs
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-agent-llm.smoke.mjs
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/sell-review-agent-llm.smoke.mjs
node workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/state-store.smoke.mjs
```

Expected: all PASS

**Step 3: Write minimal implementation**

Only fix issues revealed by the verification run. Do not add extra features.

**Step 4: Run test to verify it passes**

Re-run the full command block until all targeted tests pass.

**Step 5: Commit**

```bash
git add workspace/agents/investment-advisor/strategy-runtime/overnight-holding workspace/agents/investment-advisor/skills/trading/SKILL.md
git commit -m "test: verify overnight holding rewrite"
```
