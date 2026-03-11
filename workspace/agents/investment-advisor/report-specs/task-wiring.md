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

---

## 标准 CLI 命令

```bash
node report-runtime/cli/run-report.mjs --reportType closing --tradingDate 2026-03-11 --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-report.mjs --reportType morning --tradingDate 2026-03-11 --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-report.mjs --reportType news --slot 2026-03-11-am --mode scheduled --dryRun true --publish false
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

其中 `report package` 的落地目录固定为：

- `data/<report-type>/<date-or-slot>.json`
- `reports/<report-type>/<date-or-slot>.md`
- `reports/<report-type>/<date-or-slot>.html`
- `reports/<report-type>/<date-or-slot>.publish-result.json`

---

## 失败处理

- 如果数据源失败：允许 partial
- 如果 HTML 失败：降级为 Markdown
- 如果上传失败：保留本地文件并发送文本摘要
- 如果发送失败：至少保留发布结果与待重发记录

---

## 设计底线

1. 不允许定时任务里写一大段临时提示词代替技能。
2. 不允许每个任务都临时决定字段格式。
3. 不允许模板直接绕过 schema。
4. 不允许上传失败导致整份报告完全丢失。
5. 定时任务只负责传参与调用 `run-report.mjs`，不要重复实现报告逻辑。
