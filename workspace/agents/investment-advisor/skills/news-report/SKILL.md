---
name: news-report
description: Use when generating or scheduling market news reports that filter important macro, policy, industry, and company events into a structured market-impact briefing.
---

# news-report

## 目标

生成标准化的**消息面报告**，从新闻流中筛出真正影响市场理解的关键变量。

## 何时使用

- 用户要求生成消息面报告
- 定时任务在早晨或重大事件后触发
- 需要输出“哪些信息正在驱动市场”的简报

## 固定执行流程

1. 收集宏观、政策、行业、公司与突发事件信息
2. 判断影响对象、影响方向、影响层级
3. 过滤噪音与低价值热点
4. 产出标准 JSON（遵循 `report-specs/shared-schema.md`）
5. 生成 Markdown
6. 如模板已就绪，再生成 HTML
7. 如启用发布，再上传 OSS 并准备飞书摘要

## 必写内容

- 一句话结论
- 三点摘要
- 今日关键消息 Top 列表
- 宏观 / 政策 / 行业 / 公司 四层判断
- 持续跟踪点
- 噪音过滤

## 禁止事项

- 不把所有新闻都堆进去
- 不把传闻当事实
- 不省略消息来源状态
- 不输出没有影响路径的空洞结论

## 降级规则

- 若消息源不完整：保留重点消息与说明，不强行凑满条数
- 若 HTML 模板未就绪：只输出 Markdown
- 若上传失败：保留本地文件，飞书只发摘要版

## 产物约定

- `data/news/<date-or-slot>.json`
- `reports/news/<date-or-slot>.md`
- `reports/news/<date-or-slot>.html`（可选）
- `reports/news/<date-or-slot>.publish-result.json`

## 当前执行命令

使用内置 fixture 做 dry-run：

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/reports/news/run.mjs --slot 2026-03-11-am --mode manual --dryRun true --publish false
```

使用外部快照文件：

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/reports/news/run.mjs \
  --slot 2026-03-11-am \
  --mode manual \
  --dryRun true \
  --publish false \
  --sourceMode files \
  --briefFile /path/to/news-brief.json
```

说明：

- 消息面报告重点是筛选、影响路径与噪音过滤，不是堆满新闻标题。
- 若消息源不完整，允许输出 `partial`，但必须在 `sources` 与摘要里说明。
