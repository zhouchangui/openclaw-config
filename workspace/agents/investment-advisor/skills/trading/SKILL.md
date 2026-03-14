---
name: trading
description: Use when running the virtual overnight-holding workflow for buy, sell-review, status, stop/resume, and audit report generation.
---

# trading

## 单一入口定位

`trading` 是隔日持股研究 workflow 的唯一 skill 入口。

- 只允许**虚拟买入 / 虚拟卖出复盘 / 审计报告**，禁止真实下单或连接真实券商账户。
- 直聊和 cron 都应先走这个 skill，不要在消息里重复内部命令细节。

## 支持动作

- `buy`
- `sell-review`
- `status`
- `stop`
- `resume-request`
- `resume`
- `daily-report` / `weekly-report` / `monthly-report` / `anomaly-report`

## 输入参数

- `action`：上面的动作之一
- `tradingDate`：`YYYY-MM-DD`
- `variant`：`leader | midcore | both`，仅 `buy`
- `checkpointAt`：如 `09:40`，仅 `sell-review`
- `dryRun`：默认 `false`
- `marketFile` / `candidatesFile`：可选真实 `buy` 输入；若未提供，运行时自动以 `Tushare -> Akshare -> web` 获取 live 输入
- `snapshotsFile`：真实 `sell-review` 输入
- `llmDecisionFile`：可选；若无则运行时自动向 `investment-advisor` agent 获取结构化 JSON 决策
- `fromDate` / `toDate`：聚合报告使用

## 固定 SOP

1. 先确认这是**虚拟研究**，不是实盘执行。
2. `buy`：优先使用 `Tushare` 获取全市场真实数据；当 `Tushare` 报错、超时或返回空数据时，降级到 `Akshare`，再不行才降级到 `web`。若已提供 `marketFile/candidatesFile`，则直接使用外部输入。运行时先做全市场技术预筛，剔除 ST / 停牌 / 无效行，并把候选收敛到 `<=50` 后再交给 LLM。LLM 输出后还必须经过最终风控复核（`allow / reduce / ask_user_first / veto`），只有 `allow` 才会落地虚拟买入、状态和审计档。
3. `sell-review`：准备持仓快照，运行 `run-sell-review.mjs`，记录卖出复盘和审计档。
4. `status / stop / resume-request / resume`：运行 `run-control.mjs` 维护状态；未确认前不自动恢复。
5. `daily-report / weekly-report / monthly-report / anomaly-report`：运行 `run-audit-report.mjs` 从审计 JSON 聚合报告。
6. 每次动作结束后，都要把操作结果通过 investment 飞书私聊发送给用户。

## 最终回复合同

- 第 1 行：操作标题
- 第 2 行：一句话结论
- 第 3 行：关键动作摘要或下一步提示

若只是 `resume-request`，第 3 行必须明确提示“请在飞书确认是否恢复策略”。

## 产物合同

- `data/overnight-holding/<tradingDate>.selection.json`
- `data/overnight-holding/<tradingDate>.sell-review.json`
- `data/overnight-holding/audit/<tradingDate>.json`
- `reports/overnight-holding/<tradingDate>.*.md`
- `reports/overnight-holding/audit/*.md`

## 降级规则

- 市场不适合：记录停止事件，不产生新的虚拟买入
- 策略暂停：只返回暂停状态与恢复提示
- 无持仓：如实返回“无当前持仓”
- LLM 决策失败：记录 `runtime_fallback`，不得伪装成真实 LLM
- 最终风控未放行：记录 `riskReview` 与 `blocked_by_risk_review`，不得伪装成已执行买入

## 内部执行器

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node strategy-runtime/overnight-holding/cli/run-selection.mjs ...
node strategy-runtime/overnight-holding/cli/run-sell-review.mjs ...
node strategy-runtime/overnight-holding/cli/run-control.mjs ...
node strategy-runtime/overnight-holding/cli/run-audit-report.mjs ...
```
