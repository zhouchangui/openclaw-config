---
name: news-report
description: Use when generating or scheduling investment news timeline reports that distill the latest 24 hours of real market-moving news into a structured briefing.
---

# news-report

## 单一入口定位

`news-report` 是 **标准化消息面报告 / 24 小时投资新闻时间线** 的唯一 skill 入口。

- 直聊任务和 cron 都应先调用这个 skill，再由 skill 内部驱动实现。
- 不要在 cron 文案中直接塞 shell、CLI、路径或渲染细节。

## 适用场景

- 用户要求生成消息面报告、新闻时间线、24 小时投资新闻简报
- 工作日早晨的定时新闻任务
- 重大宏观 / 政策 / 行业事件后，需要快速筛出真正影响市场的变量

## 输入参数

- `slot`：报告时段标识；定时早晨任务默认使用 `YYYY-MM-DD-am`
- `windowHours`：新闻窗口，默认 `24`
- `mode`：`manual` / `scheduled`
- `dryRun`：是否只生成本地产物，默认 `false`
- `publish`：是否发布 HTML 并生成 URL，默认 `true`
- `sourceMode`：默认 `live`；仅在受控回放时使用 `files`

## 固定 SOP

1. 确认这是“标准化消息面报告”场景，而不是临时行情问答。
2. 将新闻窗口严格限制在最近 `windowHours` 小时；新闻必须来自真实 Akshare 支持的数据源。
3. 对 CCTV 新闻单列摘要，不与普通快讯混排。
4. 在工作目录中使用 `exec` 运行统一 CLI，生成 report-data、Markdown、HTML 与发布结果。
5. 读取 stdout JSON，检查状态、标题、结论、发布 URL、产物路径。
6. 核对关键新闻是否标注**来源**与**时间**，并确认噪音已过滤。
7. 若需要发送，只返回三行摘要：标题、结论、完整链接。

## 最终回复合同

- 第 1 行：报告标题
- 第 2 行：一句话结论
- 第 3 行：完整报告：`<url>`

若本次为本地 dry-run 且没有可访问 URL，必须明确说明只生成了本地文件，不能伪造公网链接。

## 产物合同

- `data/news/<slot>.json`
- `reports/news/<slot>.md`
- `reports/news/<slot>.html`
- `reports/news/<slot>.publish-result.json`

## 降级规则

- 若部分真实消息源不可用：允许输出 `partial`，但必须在 `sources`、摘要与正文中说明缺口
- 若 HTML 渲染失败：保底输出 Markdown
- 若上传失败：保留本地文件，不伪造 URL
- 若发送失败：显式返回失败信息，不假装已送达

## 禁止事项

- 不把所有标题堆成流水账
- 不把传闻或猜测当事实
- 不读取超出时间窗的陈旧噪音，除非用户明确要求
- 不省略消息来源状态
- 不在 cron 文案中复制内部执行命令

## 内部执行器

当需要实际生成报告时，在工作目录中运行统一 CLI：

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
FEISHU_BOT_WEBHOOK= FEISHU_BOT_SECRET= \
node report-runtime/cli/run-report.mjs \
  --reportType news \
  --slot <slot> \
  --mode <manual|scheduled> \
  --dryRun <true|false> \
  --publish <true|false> \
  --sourceMode <live|files> \
  --windowHours <hours>
```

说明：

- 个人私聊链路优先，不依赖群 webhook。
- 若使用受控回放，可额外传入 `--briefFile <path>`。

## 验证清单

- 时间窗是否严格为最近 24 小时
- 关键新闻是否带来源与时间
- CCTV 摘要是否单列
- 最终回复是否严格三行
