---
name: morning-report
description: Use when generating or scheduling A-share-focused pre-market reports that summarize overnight markets, key signals, watch sectors, and risks before the trading day begins.
---

# morning-report

## 目标

生成标准化的**早盘报告**，用于在开盘前帮助用户快速建立当日市场观察框架。

## 何时使用

- 用户要求生成早盘报告
- 定时任务在交易日早晨触发
- 需要输出“今天怎么看市场”的盘前摘要

## 固定执行流程

1. 获取隔夜外围市场与宏观信息
2. 提取今日政策/事件变量
3. 整理关注方向与风险点
4. 产出标准 JSON（遵循 `report-specs/shared-schema.md`）
5. 生成 Markdown
6. 如模板已就绪，再生成 HTML
7. 如启用发布，再上传 OSS 并准备飞书摘要

## 必写内容

- 一句话结论
- 三点摘要
- 外围市场影响
- 今日主线预判
- 今日关注清单
- 风险提醒

## 禁止事项

- 不做真实交易执行
- 不输出买卖指令
- 不伪造缺失数据
- 不把新闻堆砌成流水账

## 降级规则

- 若外围数据部分缺失：保留文本报告，标注“部分数据暂缺”
- 若 HTML 模板未就绪：只输出 Markdown
- 若上传失败：保留本地结果，摘要照常可发

## 产物约定

- `data/morning/<date>.json`
- `reports/morning/<date>.md`
- `reports/morning/<date>.html`（可选）
- `reports/morning/<date>.publish-result.json`

## 当前执行命令

使用内置 fixture 做 dry-run：

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/reports/morning/run.mjs --tradingDate 2026-03-11 --mode manual --dryRun true --publish false
```

使用外部快照文件：

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/reports/morning/run.mjs \
  --tradingDate 2026-03-11 \
  --mode manual \
  --dryRun true \
  --publish false \
  --sourceMode files \
  --briefFile /path/to/morning-brief.json
```

说明：

- 早盘报告聚焦隔夜环境、盘前偏向、今日关注方向与风险提醒。
- 若隔夜或政策字段不完整，允许输出 `partial`，但必须在 `sources` 与摘要中明确说明。
