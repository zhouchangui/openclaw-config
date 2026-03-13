# task-wiring.md

## 定时任务接入原则

定时任务未来只做调度，不直接写报告正文。

统一模式：

```text
schedule trigger -> call run-report CLI -> produce report package -> publish -> notify
```

---

## 推荐触发时段

### morning-report
- 交易日 08:00 ~ 08:45

### closing-report
- 交易日 15:15 ~ 16:00

### news-report
- 早晨固定时段一次
- 或重大事件后触发一次

### trading / overnight-holding
- T 日 `14:30` 触发一次 `buy`
- T+1 `09:35` 后每 `5` 分钟触发一次 `sell-review`
- 用户可随时执行 `stop`
- 行情不适合时自动停止
- 行情转好后，先通过飞书发 `resume-request`，用户确认后再恢复

---

## 标准 CLI 命令

```bash
node report-runtime/cli/run-report.mjs --reportType closing --tradingDate 2026-03-11 --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-report.mjs --reportType morning --tradingDate 2026-03-11 --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-report.mjs --reportType news --slot 2026-03-11-am --mode scheduled --dryRun true --publish false
node strategy-runtime/overnight-holding/cli/run-selection.mjs --tradingDate 2026-03-12 --variant both --dryRun true
node strategy-runtime/overnight-holding/cli/run-sell-review.mjs --tradingDate 2026-03-13 --source previous-selection --checkpointAt 09:40 --dryRun true
node strategy-runtime/overnight-holding/cli/run-control.mjs --action resume-request --tradingDate 2026-03-13
node strategy-runtime/overnight-holding/cli/run-audit-report.mjs --reportType daily-report --tradingDate 2026-03-13
node strategy-runtime/overnight-holding/cli/run-audit-report.mjs --reportType weekly-report --fromDate 2026-03-09 --toDate 2026-03-13
```

---

## 定时任务最小参数

```json
{
  "reportType": "closing",
  "tradingDate": "2026-03-11",
  "mode": "scheduled",
  "publish": true,
  "dryRun": false
}
```

隔日持股最小参数示例：

```json
{
  "action": "buy",
  "tradingDate": "2026-03-12",
  "variant": "both",
  "mode": "scheduled",
  "dryRun": false
}
```

---

## 输出要求

每次任务结束至少返回：

```json
{
  "ok": true,
  "reportType": "closing",
  "status": "ready",
  "markdownPath": "...",
  "htmlPath": "...",
  "url": "...",
  "messageSummary": "..."
}
```

隔日持股任务结束至少返回：

```json
{
  "ok": true,
  "phase": "selection",
  "tradingDate": "2026-03-12",
  "messageSummary": "...",
  "dataPath": "...",
  "markdownPath": "..."
}
```

其中 `report package` 的落地目录固定为：

- `data/<report-type>/<date-or-slot>.json`
- `reports/<report-type>/<date-or-slot>.md`
- `reports/<report-type>/<date-or-slot>.html`
- `reports/<report-type>/<date-or-slot>.publish-result.json`

隔日持股产物目录：

- `data/overnight-holding/<tradingDate>.selection.json`
- `reports/overnight-holding/<tradingDate>.selection.md`
- `data/overnight-holding/<tradingDate>.sell-review.json`
- `reports/overnight-holding/<tradingDate>.sell-review.md`
- `data/overnight-holding/audit/<tradingDate>.json`
- `reports/overnight-holding/audit/*.md`
- `data/overnight-holding/state.json`
- `data/overnight-holding/journals/*.json`

---

## 失败处理

- 如果数据源失败：允许 partial
- 如果 HTML 失败：降级为 Markdown
- 如果上传失败：保留本地文件并发送文本摘要
- 如果发送失败：至少保留发布结果与待重发记录
- 如果市场不适合：自动记录停止事件，并发送暂停通知到飞书
- 如果策略被用户停用：只返回暂停状态，不执行新的买入
- 如果行情恢复：先发送飞书恢复确认，再等待用户同意

---

## 设计底线

1. 不允许定时任务里写一大段临时提示词代替技能。
2. 不允许每个任务都临时决定字段格式。
3. 不允许模板直接绕过 schema。
4. 不允许上传失败导致整份报告完全丢失。
5. 定时任务只负责传参与调用 `run-report.mjs`，不要重复实现报告逻辑。
6. `trading` 的 daily 操作报告必须通过飞书 DM 发送给用户。
7. `trading` 不允许在未确认前自动恢复策略。
