# 隔日持股 Runtime

`strategy-runtime/overnight-holding/` 是 `investment-advisor` 中“隔日持股研究”这条执行链路的运行时目录。

这条链路是**纯虚拟研究链路**：

- 会记录虚拟买入
- 会记录次日卖出复盘动作
- 会维护策略状态与审计档
- **不会**连接券商，也**不会**执行真实下单

这份文档面向后续开发者，目标不是介绍“怎么用”，而是帮助你快速判断：

- 当前 buy / sell-review / control 链路到底是怎么跑的
- 每一步正确的输入、输出、状态变化是什么
- 出现 fallback 时应该在哪里看到证据
- 如何验证这条链路现在是不是“真的按设计执行”

## 1. Runtime 范围

当前 runtime 主要有三类执行入口：

- `cli/run-selection.mjs`：T 日选股与虚拟买入记录
- `cli/run-sell-review.mjs`：T+1 卖出复盘与虚拟平仓记录
- `cli/run-control.mjs`：状态查看、暂停、恢复请求、恢复执行

另有一类审计报告入口：

- `cli/run-audit-report.mjs`：从审计 JSON 聚合导出 Markdown 报告

默认工作节奏是：

- **T 日 14:30 左右**：执行 `selection`
- **T+1 09:35 起**：执行 `sell-review`
- **任意时刻**：执行 `control` 或导出审计报告

## 2. 安全边界

这条链路有明确约束：

- 只允许虚拟买入
- 只允许虚拟卖出复盘
- 不允许真实订单执行
- 不允许隐式 mock
- 不允许在 stop 后静默自动恢复

如果市场数据、输入快照、LLM 决策任一环节失败，系统只能：

- 显式报错终止，或
- 显式记录 fallback

绝不能把 fallback 结果伪装成“真实 live 路径已成功执行”。

## 3. 关键文件与职责

### CLI 入口

- `cli/run-selection.mjs`
- `cli/run-sell-review.mjs`
- `cli/run-control.mjs`

### 核心逻辑

- `lib/build-selection-package.mjs`：选股总编排
- `lib/live-selection-inputs.mjs`：选股输入解析与 live provider 调度
- `lib/market-regime.mjs`：市场可交易门槛判断
- `lib/score-candidates.mjs`：候选股评分
- `lib/portfolio.mjs`：资金约束、虚拟成交、状态变更
- `lib/sell-decision.mjs`：卖出复盘规则引擎
- `lib/agent-decision.mjs`：agent 提示词与 fallback 包装
- `lib/state-store.mjs`：运行时状态持久化
- `lib/audit-store.mjs`：审计档持久化

### 主要产物

- `data/overnight-holding/state.json`
- `data/overnight-holding/<date>.selection.json`
- `data/overnight-holding/<date>.sell-review.json`
- `data/overnight-holding/audit/<date>.json`
- `reports/overnight-holding/*.md`

## 4. 选股链路（`run-selection.mjs`）

### 4.1 输入解析

`run-selection.mjs` 接收这些参数：

- `tradingDate`
- `variant=leader|midcore|both`
- `dryRun`
- 可选 `marketFile`
- 可选 `candidatesFile`
- 可选 `llmDecisionFile`
- 可选 `workspaceRoot`

输入解析逻辑位于 `lib/live-selection-inputs.mjs`。

执行规则如下：

1. 如果 `dryRun=true`，直接读取 fixture。
2. 如果 `dryRun=false` 且同时传入了 `marketFile` 和 `candidatesFile`，直接使用外部文件。
3. 如果 `dryRun=false` 且未传入文件，则自动走 live 数据源。

当前 live 数据源优先级是：

1. `tushare`
2. `akshare`

只有当 `tushare` 出现以下情况时才允许降级到 `akshare`：

- 请求报错
- 请求超时
- 返回空结果

这类降级会写入审计：

- `dataLineage.inputProvider`
- `dataLineage.fallbackFrom`
- `dataLineage.providerAttempts`
- `exceptionsAndFallbacks[]`

### 4.2 Live provider 路径

选股 live 输入由以下文件负责：

- `lib/live-selection-inputs.mjs`
- `python/build_live_selection_inputs.py`

当前默认研究股票池是：

- `300750`
- `002594`
- `601991`
- `600121`
- `600519`

可以通过环境变量覆盖：

- `INVESTMENT_SELECTION_SYMBOLS=300750,002594,...`

相关环境变量包括：

- `INVESTMENT_TUSHARE_TOKEN`
- `INVESTMENT_TUSHARE_BASE_URL`
- `INVESTMENT_SELECTION_PROVIDER_TIMEOUT_MS`
- `INVESTMENT_SELECTION_PYTHON`

provider 的输出分成两部分：

- `marketSnapshot`
- `candidateSnapshot`

其中：

- `marketSnapshot` 用于市场是否可交易的判断
- `candidateSnapshot.candidates[]` 用于候选评分和后续的虚拟买入分配

### 4.3 市场门槛（market gate）

市场门槛逻辑位于 `lib/market-regime.mjs`。

会计算以下字段：

- `mainThemeClarity`
- `sectorBreadthConcentration`
- `afternoonStrengthRetention`
- `coreLeaderConfirmation`
- `sectorContinuityScore`

只有满足以下条件，系统才认为当天可交易：

- `sectorContinuityScore >= 70`
- `mainThemeClarity >= 65`
- `afternoonStrengthRetention >= 60`
- `coreLeaderConfirmation >= 60`

如果市场不可交易：

- 记录 `market_stop`
- runtime 状态切为暂停
- 不会生成新的虚拟买入

### 4.4 候选评分

评分逻辑在 `lib/score-candidates.mjs`。

支持两种变体：

- `leader`：更偏板块辨识度、题材共振
- `midcore`：更偏流动性、趋势完整性、兑现性

每个候选都会输出：

- `totalScore`
- `rejectReason`
- `selectionReasons`
- `breakdown`

之后 runtime 会把 leader 和 midcore 的评分结果合并成统一 `candidatePool`，
同一只股票若同时出现，保留得分更高的那一条。

### 4.5 资金与仓位约束

在真正应用买入动作前，`lib/portfolio.mjs` 会计算：

- `reservedCashFloor`
- `deployableToday`
- `actualDeployAmount`
- `availableSlots`
- `selectedCount`

当前策略约束是：

- 初始资金：`100000`
- 单日最大投入：`50%`
- 现金缓冲：`30%`
- 最大同时持仓：`3`
- 单日最大新开仓：`3`

所以就算当天评分很高，也可能因为以下原因导致不买：

- 可用现金不足
- 当前没有空余持仓槽位
- 策略处于暂停状态

### 4.6 Agent 决策与 runtime fallback

评分之后，runtime 会尝试向 `investment-advisor` agent 请求结构化 JSON 决策，
除非：

- 已显式提供 `llmDecisionFile`
- 或者 agent 调用失败，只能退回 runtime fallback

这一层由 `lib/agent-decision.mjs` 管理。

可能的决策来源有三种：

- `file`
- `agent`
- `runtime_fallback`

如果 agent 失败，runtime 会退回一个确定性的规则决策结果，依据：

- 排名
- 资金约束
- 仓位约束

这类 fallback 必须明确记录为：

- `llmDecisionJson.decisionMode = runtime_fallback`
- `dataLineage.llmDecisionSource = runtime_fallback`
- `exceptionsAndFallbacks[].type = llm_decision_missing`

不能把它写成 `agent`。

### 4.7 状态写入

如果最终结果是 `action=buy`，则 `applyBuyToState()` 会更新：

- `virtualBuys[]`
- `currentPositions[]`
- `portfolio.cashBalance`
- `portfolio.feesPaid`

每个 open 持仓至少包含：

- `symbol`
- `variant`
- `openedOn`
- `allocatedAmount`
- `allocatedWeightPct`
- `decisionPrice`
- `auditFillPrice`
- `quantity`

同时还会追加：

- `selectionJournal[]`
- `journals/<date>.selection-log.json`

### 4.8 选股产物校验

一次成功的 selection 执行后，至少检查这些文件：

- `data/overnight-holding/<date>.selection.json`
- `reports/overnight-holding/<date>.selection.md`
- `data/overnight-holding/state.json`
- `data/overnight-holding/audit/<date>.json`

顶层 selection payload 至少应包含：

- `marketGate`
- `selectedCandidates`
- `candidatePool`
- `virtualBuys`
- `llmDecisionJson`
- `portfolioDecision`
- `executionLog`
- `dataSourceMode`
- `inputDataSource`

## 5. 卖出复盘链路（`run-sell-review.mjs`）

### 5.1 输入

卖出复盘需要：

- `tradingDate`
- `source`
- `checkpointAt`（默认 `09:35`）
- `snapshotsFile`（当 `dryRun=false` 时必填）

与 selection 不同，sell-review 目前**不会**自动抓自己的分钟级快照，
它依赖显式传入的快照输入。

### 5.2 open 持仓过滤

runtime 会先读取 `state.json`，只对当前 `status=open` 的持仓做复盘。

这意味着：

- 快照里存在但当前并非 open 的股票，仍会出现在审计候选上下文里
- 但会被标记为 `rejectReason=not_in_open_positions`
- 不会进入实际执行

### 5.3 规则引擎

卖出复盘第一层是规则引擎，位于 `lib/sell-decision.mjs`。

每个持仓会得到以下三种动作之一：

- `sell_now`
- `sell_on_first_push`
- `hold_and_recheck`

同时会附带：

- 原因
- 置信度
- 必要时的 `nextCheckAt`

如果当前没有 open 持仓，系统会如实返回“本轮无持仓处理”，不会捏造动作。

### 5.4 Agent 合并

和 selection 一样，sell-review 的决策来源也可能是：

- `llmDecisionFile`
- `agent`
- `runtime_fallback`

执行顺序是：

1. 先生成规则决策
2. 再允许 agent 对规则结果做逐标的覆盖

如果 agent 失败：

- 规则决策继续生效
- 结果记为 `runtime_fallback`
- 审计中写入 fallback 原因

### 5.5 卖出复盘执行语义

对每个 open 持仓：

- `hold_and_recheck`：持仓保持 open，只更新 `nextCheckAt` 和 `lastReviewAction`
- `sell_now` / `sell_on_first_push`：通过 `applySellToState()` 关闭该持仓

平仓后状态会写入：

- `status=closed`
- `closedOn`
- `lastReviewAction`
- `closeDecisionPrice`
- `closeAuditFillPrice`
- `grossPnl`
- `netPnl`

组合层面会同步更新：

- `portfolio.cashBalance`
- `portfolio.feesPaid`
- `portfolio.realizedPnl`

### 5.6 卖出复盘产物校验

一次成功的 sell-review 后，应检查：

- `data/overnight-holding/<date>.sell-review.json`
- `reports/overnight-holding/<date>.sell-review.md`
- `data/overnight-holding/state.json`
- `data/overnight-holding/audit/<date>.json`

payload 至少应包含：

- `decisions`
- `llmDecisionJson`
- `executionLog`
- `dataSourceMode`
- `messageSummary`

审计里重点看：

- `ruleEngineResult.openPositions`
- `ruleEngineResult.reviewedSymbols`
- `positionSnapshots.beforeReview`
- `positionSnapshots.afterReview`

## 6. 控制链路（`run-control.mjs`）

支持的动作：

- `status`
- `stop`
- `resume-request`
- `resume`

这条链路虽然简单，但直接决定 selection 是否还能继续开新仓。

`state.json` 中的关键状态字段是：

- `enabled`
- `stoppedBy`
- `resumeRequired`
- 可选 `lastResumeRequest`
- 可选 `lastResumedAt`

行为如下：

- `stop`：记录 `user_pause`，设置 `enabled=false`、`resumeRequired=true`
- `resume-request`：记录恢复请求，同时保持 `enabled=false`、`resumeRequired=true`
- `resume`：设置 `enabled=true`，清除 stop 原因，清除 resume-required

这里要特别注意：

当前逻辑已经修过一次，`resume-request` 不再允许留下
“`enabled=true` 但 `resumeRequired=true`” 这种半开状态。

## 7. 持久化状态模型

`data/overnight-holding/state.json` 是这条链路的核心运行时状态。

主要结构包括：

- `virtualBuys`
- `currentPositions`
- `selectionJournal`
- `sellReviewJournal`
- `stopEvents`
- `portfolio`
- `status`

每个阶段建议这样核对：

- `selection` 之后：`virtualBuys` 应新增记录，`currentPositions` 应新增 `open`
- `sell-review` 之后：对应持仓要么继续 open，要么切到 `closed`
- `control` 之后：`status` 字段必须与动作语义一致

## 8. 审计模型

所有核心动作都会写到：

- `data/overnight-holding/audit/<date>.json`

审计结构主要包括：

- `marketContext`
- `candidatePool`
- `ruleEngineResult`
- `llmDecisionHistory`
- `portfolioDecisionHistory`
- `executionLog`
- `positionSnapshots`
- `userCommunications`
- `dataLineage`
- `exceptionsAndFallbacks`
- `reportExports`

这是最重要的排障文件。它可以回答：

- 这次到底用了哪个数据源？
- 有没有发生 provider fallback？
- LLM 是真的走了 agent，还是 runtime fallback？
- 哪些持仓发生了状态变化？
- runtime 最终准备让 Feishu 发什么内容？

## 9. 数据源与 fallback 规则

### Selection 输入来源

selection 的输入模式分三种：

- `fixtures`
- `external-files`
- `live-provider`

其中 `live-provider` 的含义是：

- 先尝试 `tushare`
- 失败后才尝试 `akshare`

成功路径与 fallback 路径都会写入数据血缘。

### LLM 决策来源

selection 和 sell-review 都可能出现：

- `file`
- `agent`
- `runtime_fallback`

fallback 可以接受，但必须显式记录。

### Sell-review 数据降级

卖出复盘链路还可能出现快照层面的数据降级，例如：

- `daily-fallback`

这些信息会写到：

- `exceptionsAndFallbacks[]`
- 决策对象里的原始字段

## 10. 端到端校验方法

### Selection 校验清单

1. 运行 `run-selection.mjs`
2. 确认 `ok=true`
3. 确认 `dataSourceMode` 是否符合预期
4. 确认 `inputDataSource.provider` 是否正确
5. 确认 `marketGate.tradable` 与最终结果一致
6. 确认 `llmDecisionJson.decisionMode` 是真实的 `agent` 或显式的 `runtime_fallback`
7. 确认 `virtualBuys.length` 与 `executionLog` 中的 buy 数量一致
8. 确认 `state.json` 中存在对应 open 持仓
9. 确认审计 `dataLineage` 与实际数据源路径/来源一致

### Sell-review 校验清单

1. 运行 `run-sell-review.mjs`
2. 确认被 review 的 symbol 在 review 前确实是 open
3. 确认每个动作都属于三种允许动作之一
4. 确认 `hold_and_recheck` 不会把仓位关掉
5. 确认 `sell_now` / `sell_on_first_push` 会把仓位关掉
6. 确认现金、费用、已实现盈亏的变化一致
7. 确认审计里的 before/after 快照与状态文件一致

### Control 校验清单

1. 分别跑 `status`、`stop`、`resume-request`、`resume`
2. 核对每次执行后的 `state.status`
3. 确认审计 `executionLog` 有 `control_action`
4. 确认 `resume-request` 不会静默恢复策略

## 11. 当前已知运行预期

- `selection` 在真实模式且未传文件时，应优先走 `tushare`
- 如果 `tushare` 不可用，允许退到 `akshare`
- `sell-review` 目前仍要求显式传入快照文件
- runtime 自己只记录“待投递”的 Feishu 摘要，不负责保证最终通道一定发送成功

## 12. 常用命令

### Dry-run selection

```bash
node strategy-runtime/overnight-holding/cli/run-selection.mjs \
  --tradingDate 2026-03-12 \
  --variant both \
  --dryRun true
```

### 真实 selection（显式文件）

```bash
node strategy-runtime/overnight-holding/cli/run-selection.mjs \
  --tradingDate 2026-03-13 \
  --variant both \
  --dryRun false \
  --marketFile /abs/path/market.json \
  --candidatesFile /abs/path/candidates.json
```

### 真实 selection（自动 live provider）

```bash
node strategy-runtime/overnight-holding/cli/run-selection.mjs \
  --tradingDate 2026-03-13 \
  --variant both \
  --dryRun false
```

### Sell-review

```bash
node strategy-runtime/overnight-holding/cli/run-sell-review.mjs \
  --tradingDate 2026-03-14 \
  --source previous-selection \
  --checkpointAt 09:35 \
  --dryRun false \
  --snapshotsFile /abs/path/snapshots.json
```

### Control

```bash
node strategy-runtime/overnight-holding/cli/run-control.mjs --action status --tradingDate 2026-03-14
node strategy-runtime/overnight-holding/cli/run-control.mjs --action stop --tradingDate 2026-03-14
node strategy-runtime/overnight-holding/cli/run-control.mjs --action resume-request --tradingDate 2026-03-14
node strategy-runtime/overnight-holding/cli/run-control.mjs --action resume --tradingDate 2026-03-14
```
