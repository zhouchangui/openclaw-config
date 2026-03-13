---
name: trading
description: Use when running the virtual overnight-holding workflow, including T-day 14:30 selection, T+1 09:35+ sell-review, strategy status checks, user stop, and resume confirmation.
---

# trading

## 单一入口定位

`trading` 是 **隔日持股研究 workflow** 的统一 skill 入口。

- 所有“隔日持股选股 / 次日卖出复盘 / 策略停用 / 恢复确认 / 状态查看”都先走这个 skill。
- 该 skill **只允许虚拟买入 / 虚拟卖出复盘**，禁止真实下单、真实账户执行或券商侧动作。
- cron 只描述“使用 trading skill 执行哪个 action，并把操作报告通过 investment 飞书私聊发送给用户”，不嵌入实现细节。

## 支持动作

- `buy`：T 日 14:30 执行虚拟选股，记录虚拟买入与持仓
- `sell-review`：T+1 09:35 后每 5 分钟复盘一次卖出动作
- `status`：查看策略当前状态、持仓与恢复要求
- `stop`：用户明确要求暂停策略
- `resume-request`：市场回暖后，通过飞书询问用户是否恢复
- `resume`：用户已在飞书确认后，恢复后续执行
- `report` / `daily-report`：生成某一交易日的审计日报
- `weekly-report`：按时间范围聚合审计周报
- `monthly-report`：按时间范围聚合审计月报
- `anomaly-report`：导出异常 / fallback 汇总

## 输入参数

- `action`：`buy | sell-review | status | stop | resume-request | resume | report | daily-report | weekly-report | monthly-report | anomaly-report`
- `tradingDate`：交易日，格式 `YYYY-MM-DD`
- `variant`：`leader | midcore | both`，仅 `buy` 使用，默认 `both`
- `checkpointAt`：如 `09:40`，仅 `sell-review` 使用
- `dryRun`：是否只落本地产物，默认 `false`
- `marketFile` / `candidatesFile`：`buy` 在真实执行时必填；受控回放或 dry-run 也可显式传入
- `snapshotsFile`：`sell-review` 在真实执行时必填；受控回放或 dry-run 也可显式传入
- `llmDecisionFile`：可选；若外部已产出结构化决策 JSON，则优先落审计；未提供时会记录 `runtime_fallback`
- `fromDate` / `toDate`：`weekly-report` / `monthly-report` / `anomaly-report` 使用

## 固定 SOP

1. 先确认当前动作属于虚拟研究，而非真实交易执行。
2. 若为 `buy`：
   - 先用 `akshare-stock` 或外部快照流程生成市场快照与候选列表 JSON；
   - 先判断主线延续性与板块连续性是否允许执行；
   - 若策略已暂停或 `resumeRequired=true`，只发送恢复确认，不自动恢复；
   - 运行 `run-selection.mjs`，记录虚拟买入、当前持仓、选股日志，并输出操作报告。
3. 若为 `sell-review`：
   - 先准备当前持仓对应的盘口 / 量能 / 走势快照 JSON；
   - 只在 `09:35` 后按 5 分钟节奏执行；
   - 默认目标是午前兑现，仅在“单边上行 + 量能确认”时延后一个检查点；
   - 运行 `run-sell-review.mjs`，记录决策快照与卖出复盘日志。
4. 若为 `status / stop / resume-request / resume`：
    - 运行 `run-control.mjs` 维护状态；
    - `resume-request` 只负责发起飞书确认，不自动恢复。
5. 若为 `report / daily-report / weekly-report / monthly-report / anomaly-report`：
   - 运行 `run-audit-report.mjs` 从 `data/overnight-holding/audit/YYYY-MM-DD.json` 聚合报告；
   - `daily-report` / `report` 会回写 `reportExports` 以保留导出历史。
6. 每次动作结束后，都要把操作报告通过 investment 飞书私聊发送给用户。

## 最终回复合同

- 第 1 行：本次操作标题
- 第 2 行：一句话结论
- 第 3 行：关键动作摘要或下一步提示

如果本次只是触发恢复确认，第 3 行必须明确提示“请在飞书确认是否恢复策略”。

## 产物合同

- `data/overnight-holding/<tradingDate>.selection.json`
- `reports/overnight-holding/<tradingDate>.selection.md`
- `data/overnight-holding/<tradingDate>.sell-review.json`
- `reports/overnight-holding/<tradingDate>.sell-review.md`
- `data/overnight-holding/audit/<tradingDate>.json`
- `reports/overnight-holding/audit/*.md`
- `data/overnight-holding/state.json`
- `data/overnight-holding/journals/*.json`

## 降级规则

- 若市场主线不清晰：记录市场停止事件，不产生新的虚拟买入
- 若策略处于暂停：只返回暂停状态与恢复提示
- 若没有持仓可复盘：如实返回“无当前持仓”，不伪造卖出动作
- 若局部数据缺失：保留已验证的决策依据，并明确说明缺口

## 禁止事项

- 禁止真实下单
- 禁止真实交易
- 禁止连接真实券商账户
- 禁止把虚拟研究结果伪装成实盘执行
- 禁止在无用户确认时自动恢复策略

## 内部执行器

### buy

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node strategy-runtime/overnight-holding/cli/run-selection.mjs \
  --tradingDate <YYYY-MM-DD> \
  --variant <leader|midcore|both> \
  --dryRun <true|false> \
  --marketFile <optional-market-json> \
  --candidatesFile <optional-candidates-json>
```

### sell-review

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node strategy-runtime/overnight-holding/cli/run-sell-review.mjs \
  --tradingDate <YYYY-MM-DD> \
  --source previous-selection \
  --checkpointAt <HH:MM> \
  --dryRun <true|false> \
  --snapshotsFile <optional-snapshots-json>
```

### status / stop / resume-request / resume

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node strategy-runtime/overnight-holding/cli/run-control.mjs \
  --action <status|stop|resume-request|resume> \
  --tradingDate <YYYY-MM-DD>
```

### report / daily-report / weekly-report / monthly-report / anomaly-report

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node strategy-runtime/overnight-holding/cli/run-audit-report.mjs \
  --reportType <daily-report|weekly-report|monthly-report|anomaly-report> \
  --tradingDate <YYYY-MM-DD> \
  --fromDate <optional-YYYY-MM-DD> \
  --toDate <optional-YYYY-MM-DD>
```

## 验证清单

- 是否明确为虚拟买入 / 虚拟卖出复盘
- 是否在 `14:30` 执行选股，在 `09:35+` 做 5 分钟卖出复盘
- 是否保留买入记录、当前持仓、选股过程、卖出分析与停止事件
- 是否写入固定格式审计 JSON，并能从中聚合日报 / 周报 / 月报 / 异常报告
- 是否在市场不适合时主动停止，并在恢复前通过飞书确认
- 是否每次执行后都给用户发送操作报告
