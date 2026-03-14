# Overnight-Holding Selection Pipeline Analysis

## 1. ORCHESTRATION IN build-selection-package.mjs (Lines 196-442)

### Core Flow Orchestration

The pipeline executes in this sequence:

#### A. Input Resolution (lines 206-214)
- Calls `resolveSelectionInputs()` from `live-selection-inputs.mjs`
- Returns:
  - `marketSnapshot` – market context data
  - `candidateSnapshot` – pre-filtered technical candidates (max 50, via `applyTechnicalPrefilter`)
  - `prefilterSummary` – scope, counts, filters applied
  - `dataSourceMode` – "fixtures", "external-files", or "live-provider"
  - `inputDataSource` – provider metadata

#### B. Market Gate Evaluation (line 215)
- `evaluateMarketRegime(marketSnapshot)` returns `marketGate`
- Key fields: `tradable` (boolean), `sectorContinuityScore`
- Acts as first veto: if `!marketGate.tradable`, no virtualBuys execute

#### C. Candidate Scoring (lines 222-228) ← **CRITICAL: scoreCandidates dependency**
```javascript
for (const item of resolveVariants(variant)) {
  selectedCandidates[item] = scoreCandidates({
    variant: item,  // 'leader' or 'midcore'
    sectorContinuityScore: marketGate.sectorContinuityScore,
    candidates: candidateSnapshot.candidates
  }).ranked;
}
```
- Called **once per variant** (leader, midcore, or both)
- Returns `{ variant, ranked: [ { symbol, name, variant, totalScore, rejectReason, selectionReasons, breakdown } ] }`
- Each candidate marked with `rejectReason: null` or `'sector_continuity_below_threshold'`

#### D. Candidate Pool Consolidation (lines 247-250)
- `buildCandidatePool(selectedCandidates)` merges leader & midcore rankings
- Deduplication: keeps highest-scoring version if same symbol appears in both variants
- Maps each to `{ ...candidate, pickedVariant, passedRules: !candidate.rejectReason, rawData }`
- **This is where `passedRules` is computed** (line 56 of build-selection-package.mjs)

#### E. Portfolio Decision (lines 251-254)
- `buildPortfolioDecision()` calculates capacity constraints
- Uses count of `candidatePool.filter(item => item.passedRules).length`
- Returns: `{ actualDeployAmount, availableSlots, selectedCount, ... }`

#### F. Fallback Buy Decision (lines 255-259)
- If no external LLM decision provided, `buildFallbackBuyDecision()` creates deterministic decision
- Uses `passedRules` to filter eligible candidates
- Ranked by `totalScore`, capped by `portfolioDecision.selectedCount`

#### G. LLM Resolution (lines 260-280)
- Either loads from `llmDecisionFile` or calls `resolveSelectionLlmDecision()` (agent wrapper)
- Agent sees `candidatePool` and `fallbackDecision` as context
- Returns `{ decision: llmDecisionJson, source: 'file'|'agent'|'runtime_fallback', agentMeta, fallbackError }`

#### H. Virtual Allocations (lines 282-288)
- `normalizeBuyAllocations({ llmDecisionJson, portfolioDecision, candidatePool })`
- Maps `llmDecisionJson.buyList[].symbol` back to `candidatePool`
- Calculates final `allocatedWeightPct` and `allocatedAmount`

#### I. Risk Review (lines 289-298)
- `reviewFinalRiskVeto()` checks `llmDecisionJson.riskFlags`
- May veto, ask user, or reduce if portfolio constraints breached
- `executionBlockedByRiskReview` flag set if decision != 'allow'

#### J. State Application (lines 305-343)
- Only executes if: `marketGate.tradable && status.enabled && action=buy && !executionBlockedByRiskReview`
- For each virtualBuy, calls `applyBuyToState()` to update positions, cash, fees
- Appends to `selectionJournal` and audit store

#### K. Output Payload (lines 354-373)
```javascript
const payload = {
  ok: true,
  phase: 'selection',
  tradingDate, variant,
  marketGate,
  selectedCandidates,    // variant → ranked array
  candidatePool,          // merged, with passedRules
  virtualBuys,            // final allocations (subset of candidatePool)
  llmDecisionJson,
  portfolioDecision,
  riskReview,
  executionLog,
  messageSummary,
  prefilterSummary,       // technical prefilter summary
  dataSourceMode, inputDataSource, dataPath, markdownPath
}
```

---

## 2. DEPENDENCIES ON score-candidates.mjs

### Direct Runtime-Critical Dependency

**File: `/Users/zcg/.openclaw/workspace/agents/investment-advisor/strategy-runtime/overnight-holding/lib/build-selection-package.mjs`**
- **Line 6:** `import { scoreCandidates } from './score-candidates.mjs';`
- **Line 223:** Called in the main selection loop
- **Usage:** Produces `selectedCandidates[variant].ranked` which feeds into `candidatePool` and downstream LLM/portfolio decisions
- **Criticality:** ⚠️ **RUNTIME-CRITICAL** – if this fails, the entire selection fails; no fallback scoring mechanism

### Test-Only Dependency

**File: `/Users/zcg/.openclaw/workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/candidate-scoring.smoke.mjs`**
- **Lines 12-14:** Direct dynamic import of `score-candidates.mjs`
- **Lines 16-39:** Three test scenarios:
  1. Leader variant with good continuity → ranked by `boardLeadership` (0.55×) + `themeResonance` (0.45×)
  2. Midcore variant → ranked by `liquidityStability` (0.52×) + `trendIntegrity` (0.48×)
  3. Both variants with low continuity (58) → all marked `rejectReason='sector_continuity_below_threshold'`
- **Assertions:** `ranked[0].symbol`, `rejectReason`, `selectionReasons.length`
- **Criticality:** ✓ **TEST-ONLY** – isolated unit test of scoring logic

### Indirect Runtime Usage (via build-selection-package)

The scoring output is consumed by:
1. `candidatePool` construction (build-selection-package.mjs:247-250)
   - Reads `totalScore`, `rejectReason`, `symbol`, `name`, `variant`, `selectionReasons`
2. `buildFallbackBuyDecision()` (portfolio.mjs:87-89)
   - Filters by `passedRules` (derived from `!rejectReason`)
   - Sorts by `totalScore`
3. `normalizeBuyAllocations()` (portfolio.mjs:117-127)
   - Maps buyList symbols to candidatePool entries
4. Markdown reporting (build-selection-package.mjs:168-174)
   - Renders ranked candidates with scores and reasons

**Summary:**
- **Runtime-critical:** 1 direct call site (build-selection-package.mjs:223)
- **Test-only:** 1 smoke test (candidate-scoring.smoke.mjs)
- **No fallback mechanism** if scoreCandidates fails

---

## 3. SMOKE TESTS RELEVANT TO SELECTION PIPELINE

### A. selection-cli.smoke.mjs (Lines 20-56)
**Path:** `/Users/zcg/.openclaw/workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-cli.smoke.mjs`

**Scenario:** Full dry-run selection with fixtures
```bash
node strategy-runtime/overnight-holding/cli/run-selection.mjs \
  --tradingDate 2026-03-12 --variant both --dryRun true \
  --marketFile fixtures/market-regime.good.json \
  --candidatesFile fixtures/candidates.sample.json
```

**Key Assertions:**
- Line 30: `result.ok === true`
- Line 31: `result.phase === 'selection'`
- Line 32: `result.marketGate.tradable === true`
- Line 33-34: **Symbol ordering** `selectedCandidates.leader[0].symbol === '300750'`, `midcore[0] === '600519'`
- Line 35: `virtualBuys.length === 2`
- Line 36-37: messageSummary and paths are written
- Line 40-41: **Persisted data matches** in .selection.json
- Line 43-44: **Markdown contains date and variant labels**
- Line 47-51: State file has positions and journal entries

**Assertions Likely Needing Adjustment if Pipeline Simplified:**
- ✓ `virtualBuys.length === 2` – may change if fewer candidates pass simplified rules
- ✓ `selectedCandidates[variant][0].symbol` – depends on scoring logic remaining identical
- ⚠️ Markdown pattern `/龙头候选/` (line 45) – OK, uses fixture data

---

### B. selection-agent-llm.smoke.mjs (Lines 26-49)
**Path:** `/Users/zcg/.openclaw/workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/selection-agent-llm.smoke.mjs`

**Scenario:** Real-mode (dryRun=false) with agent decision via fixture env var
```bash
OPENCLAW_AGENT_FIXTURE_FILE=fixtures/selection.agent-decision.sample.json \
node strategy-runtime/overnight-holding/cli/run-selection.mjs \
  --tradingDate 2026-03-12 --variant both --dryRun false
```

**Key Assertions:**
- Line 36: `result.ok === true`
- Line 37: `result.llmDecisionJson.decisionMode === 'agent'`
- Line 38: `virtualBuys.length === 2`
- Line 40-47: **Audit record exists** and contains `llmDecisionHistory[-1].decisionMode === 'agent'`
- Line 45-46: **No fallback logged** – `exceptionsAndFallbacks.some(item => item.type === 'llm_decision_missing') === false`

**Assertions Likely Needing Adjustment:**
- ✓ `virtualBuys.length === 2` – fixture has 2 symbols in buyList, but could be reduced
- ⚠️ Fallback detection logic (line 45) – would need review if fallback path changes

---

### C. final-risk-veto.smoke.mjs (Lines 15-106)
**Path:** `/Users/zcg/.openclaw/workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/final-risk-veto.smoke.mjs`

**Scenarios:** Three separate runs with different risk flags

**1. Veto Scenario (Lines 43-88)**
```javascript
llmDecisionJson: {
  action: 'buy',
  riskFlags: ['gap_risk_limit_breach'],  // Triggers veto
  ...
}
```
**Assertions:**
- Line 85: `vetoScenario.result.riskReview?.decision === 'veto'`
- Line 87: `executionLog.length === 0` – no virtualBuys applied
- Line 88: `audit.riskReviewHistory[-1].decision === 'veto'`

**2. Ask-User Scenario (Lines 57-93)**
```javascript
riskFlags: ['overnight_event_risk_requires_confirmation']  // Triggers ask_user_first
```
**Assertions:**
- Line 90: `result.riskReview?.decision === 'ask_user_first'`
- Line 92: `executionLog.length === 0`

**3. Allow Scenario (Lines 71-101)**
```javascript
riskFlags: []  // No veto flags
```
**Assertions:**
- Line 95: `result.riskReview?.decision === 'allow'`
- Line 97: `result.executionLog.length > 0` – buy executed
- Line 98: `virtualBuys.length > 0`

**Assertions Unlikely to Need Adjustment:**
- ✓ Risk flag detection (line 86, 91, 96) – independent of scoring
- ✓ Execution log presence/absence – depends on decision, not scoring details

---

### D. full-market-screening.smoke.mjs (Lines 15-56)
**Path:** `/Users/zcg/.openclaw/workspace/agents/investment-advisor/strategy-runtime/overnight-holding/smoke/full-market-screening.smoke.mjs`

**Scenario:** Real-mode (dryRun=false) with live provider fallback (uses tushare fixture)
```bash
OPENCLAW_AGENT_FIXTURE_FILE=fixtures/selection.agent-decision.sample.json \
INVESTMENT_SELECTION_TUSHARE_FIXTURE_FILE=fixtures/live-selection-provider.tushare.sample.json \
node strategy-runtime/overnight-holding/cli/run-selection.mjs \
  --tradingDate 2026-03-12 --variant both --dryRun false
```

**Key Assertions:**
- Line 35: `result.ok === true`
- Line 36: `result.dataSourceMode === 'live-provider'`
- Line 38: `result.prefilterSummary?.scope === 'full-market'`
- **Line 39-41:** **Prefilter contract**:
  ```javascript
  rawUniverseCount >= technicalCandidatesCount
  tradableUniverseCount >= technicalCandidatesCount
  technicalCandidatesCount <= 50
  ```
- Line 42: `prefilterSummary?.filters?.includes('overnight-holding-technical')`
- Line 44-51: **Same assertions on persisted payload**

**Assertions Likely Needing Adjustment:**
- ⚠️ `prefilterSummary?.technicalCandidatesCount <= 50` (line 41, 50)
  - Hard-coded limit defined in `technical-prefilter.mjs:1` (`MAX_TECHNICAL_CANDIDATES = 50`)
  - If pipeline simplification changes max, update both assertions

**No direct assertions on selected symbols** – this test is prefilter-focused, not scoring-focused

---

## 4. OUTWARD JSON/REPORT CONTRACTS

### A. Selection Payload Output (build-selection-package.mjs:354-373)

**Top-level structure written to `.selection.json`:**
```javascript
{
  ok: true,
  phase: 'selection',
  tradingDate,
  variant,
  marketGate: { tradable, sectorContinuityScore, ... },
  selectedCandidates: {
    leader: [ { symbol, name, variant, totalScore, rejectReason, selectionReasons, breakdown: { ... } } ],
    midcore: [ ... ]
  },
  candidatePool: [
    {
      symbol, name, variant, totalScore, rejectReason, selectionReasons, breakdown,
      pickedVariant,           // 'leader' or 'midcore'
      passedRules,             // boolean: !rejectReason
      rawData: { ... }
    }
  ],
  virtualBuys: [
    {
      ...candidatePool entry,
      allocatedWeightPct, allocatedAmount, pickedVariant
    }
  ],
  llmDecisionJson: {
    action: 'buy' | 'no_buy',
    buyList: [ { symbol, name, weightPct, reason } ],
    rejectedCandidates: [ { symbol, reason } ],
    principlesCited: [ ... ],
    riskFlags: [ ... ],
    confidence,
    decisionMode: 'file' | 'agent' | 'runtime_fallback'
  },
  portfolioDecision: {
    initialCapital, availableCash, reservedCashFloor, deployableToday,
    actualDeployAmount, availableSlots, selectedCount
  },
  riskReview: {
    scope: 'final_pre_execution',
    decision: 'allow' | 'veto' | 'ask_user_first' | 'reduce',
    blockedExecution,
    llmAction, riskFlags, reason, ...
  },
  executionLog: [
    { type: 'buy_executed' | 'no_buy', symbol?, allocatedAmount?, ... }
  ],
  messageSummary: "隔日持股 YYYY-MM-DD 操作报告\n...",
  prefilterSummary: {
    scope: 'full-market',
    filters: [ 'overnight-holding-technical', ... ],
    rawUniverseCount, tradableUniverseCount, technicalCandidatesCount,
    maxTechnicalCandidates: 50, universeCount, eligibleRows
  },
  dataSourceMode: 'fixtures' | 'external-files' | 'live-provider',
  inputDataSource: { provider, mode, fallbackFrom?, scope?, symbols? },
  dataPath: "...",
  markdownPath: "..."
}
```

**Tests relying on this contract:**
- `selection-cli.smoke.mjs:33-34` – `selectedCandidates[variant][0].symbol`
- `selection-cli.smoke.mjs:40-41` – full payload persisted
- `full-market-screening.smoke.mjs:36-42` – `dataSourceMode`, `prefilterSummary` fields

---

### B. Markdown Report (build-selection-package.mjs:118-177)

**Template in buildMarkdown():**
- Section 1: Header + metadata (date, scores, enabled status, deployable amount)
- Section 2 (optional): Technical prefilter scope & counts
- Section 3 (optional): Risk review decision & reason
- Section 4 (if virtualBuys.length > 0): Virtual buy list
- Section 5: LLM decision JSON (formatted)
- Section 6: Ranked candidates by variant

**Tests relying on markdown patterns:**
- `selection-cli.smoke.mjs:44` – `/2026-03-12/` (date present)
- `selection-cli.smoke.mjs:45` – `/龙头候选/` (variant label from fixture candidate name)

---

### C. candidatePool Contract

**Used by:**
1. `buildPortfolioDecision()` – counts `passedRules`
2. `buildFallbackBuyDecision()` – reads `totalScore`, `selectionReasons`, filters by `passedRules`
3. `normalizeBuyAllocations()` – maps buyList symbols to pool
4. Audit store – records full pool

**Expected fields:**
```javascript
{
  symbol, name,
  variant,           // 'leader' | 'midcore'
  totalScore,        // 0-100
  rejectReason,      // null | 'sector_continuity_below_threshold'
  selectionReasons,  // array of strings
  breakdown: { sectorContinuity, stockStrength, afternoonSupport, nextDayRealizability, variantBonus },
  pickedVariant,     // 'leader' | 'midcore'
  passedRules,       // boolean
  rawData            // nullable object from original candidate
}
```

**Tests checking these fields:**
- `audit-store.smoke.mjs:27, 34-35` – `passedRules` and `rejectReason` fields checked
- `candidate-scoring.smoke.mjs:22-23, 31-39` – `ranked[].rejectReason`, `selectionReasons`

---

### D. prefilterSummary Contract

**Source:** `technical-prefilter.mjs:applyTechnicalPrefilter()` (lines 53-76)

**Expected structure:**
```javascript
{
  scope: 'full-market',
  filters: [ 'overnight-holding-technical', ... ],
  rawUniverseCount,       // original candidates.length
  tradableUniverseCount,  // eligible rows
  technicalCandidatesCount,  // post-filter, capped at 50
  maxTechnicalCandidates: 50,
  universeCount,          // alias for rawUniverseCount
  eligibleRows            // alias for tradableUniverseCount
}
```

**Tests:**
- `full-market-screening.smoke.mjs:38-42, 45-51` – All prefilter fields validated
- **Hard constraint:** `technicalCandidatesCount <= 50` (MAX_TECHNICAL_CANDIDATES)

---

## RECOMMENDED SURGICAL EDIT POINTS FOR PIPELINE SIMPLIFICATION

### If Removing scoreCandidates:

1. **Primary removal site:** `build-selection-package.mjs` lines 222-228
   - Replace with alternative scoring or skip scoring entirely
   - Update `selectedCandidates` construction

2. **Update test assertions:**
   - `candidate-scoring.smoke.mjs` – entire file becomes obsolete or refactor
   - `selection-cli.smoke.mjs:33-34` – may need different expected symbols if scoring changes
   - `selection-agent-llm.smoke.mjs:38` – `virtualBuys.length` may change

3. **Review downstream consumers:**
   - `portfolio.mjs:87-89` – fallback scoring relies on `totalScore` for ranking
   - `portfolio.mjs:94-98` – reason field construction uses `selectionReasons`
   - Markdown output (lines 155-157) – displays totalScore

4. **Update JSON contracts:**
   - `selectedCandidates[variant].ranked[]` – may have different shape
   - `candidatePool[]` – `totalScore`, `breakdown`, `selectionReasons` may be absent or derived differently
   - Audit records – expects these fields in candidate pool

### If Modifying scoreCandidates:

1. **Update test expectations:**
   - `candidate-scoring.smoke.mjs:22, 31` – expected top symbols may change if weighting changes
   - `selection-cli.smoke.mjs:35` – `virtualBuys.length` may change if more/fewer pass new criteria

2. **Review markdown dependencies:**
   - `build-selection-package.mjs:171` – displays `totalScore` in markdown, ensure it still exists
   - `build-selection-package.mjs:156` – uses `totalScore` for report line

3. **Audit contract changes:**
   - `audit-store.mjs` records full scored result; if score structure changes, update audit schema

4. **Portfolio fallback logic:**
   - `portfolio.mjs:88` sorts by `totalScore` – ensure this field always exists if used

---

## SUMMARY TABLE: DEPENDENCIES & TEST IMPACT

| Component | File | Line(s) | Type | Impact | Edit Point |
|-----------|------|---------|------|--------|-----------|
| scoreCandidates | build-selection-package.mjs | 6, 223 | import + call | Runtime-critical | Lines 222-228 |
| scoreCandidates | candidate-scoring.smoke.mjs | 12-39 | import + test | Test-only | Entire test |
| selectedCandidates | selection-cli.smoke.mjs | 33-34 | assertion | Symbol ordering | Lines 33-34 |
| passedRules | build-selection-package.mjs | 56 | field compute | candidatePool filtering | Line 56 |
| prefilterSummary | full-market-screening.smoke.mjs | 38-42 | assertions | Prefilter contract | Lines 38-42, 45-51 |
| virtualBuys.length | multiple smoke tests | various | assertions | Buy count | All virtualBuys checks |
| decisionMode | selection-agent-llm.smoke.mjs | 37, 43-46 | assertion | LLM source tracking | Lines 37-46 |
| riskReview | final-risk-veto.smoke.mjs | 86, 91, 96 | assertions | Risk gate logic | Lines 85-101 |

