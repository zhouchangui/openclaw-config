---
name: closing-report
description: Use when generating or scheduling A-share-focused closing reports that summarize index moves, sector rotation, technical signals, and next-session watch points after market close.
---

# closing-report

## 目标

生成标准化的**收盘报告**，在收盘后输出市场结构结论、技术面确认、板块强弱与次日观察点。

## 何时使用

- 用户要求生成收盘报告
- 定时任务在交易日收盘后触发
- 需要输出“今天市场到底发生了什么”的结构化复盘

## 固定执行流程

1. 获取三大指数、成交额、板块强弱、外围映射
2. 获取技术面数据（K 线 / MA / 成交量 / MACD）
3. 生成结构判断与次日观察点
4. 产出标准 JSON（遵循 `report-specs/shared-schema.md`）
5. 生成 Markdown
6. 使用 `report-templates/closing-market-report/` 生成 HTML
7. 如启用发布，再上传 OSS 并生成飞书摘要

## 必写内容

- 一句话结论
- 三点摘要
- 核心市场看板
- 指数技术面解读
- 板块强弱图表/摘要
- 结构判断
- 明日观察点
- 风险提示

## 禁止事项

- 不伪装成自动交易系统
- 不输出买卖动作
- 不强行解释所有涨跌
- 不在缺少技术数据时伪造 MACD/K 线

## 降级规则

- 若技术面数据缺失：去掉技术图区，保留文字版收盘报告
- 若板块数据缺失：保留指数与结构判断，但标注“板块数据暂缺”
- 若 HTML 失败：保底输出 Markdown
- 若上传失败：保留本地 HTML，并仅发送文本摘要

## 当前模板

- `report-templates/closing-market-report/`

## 产物约定

- `data/closing/<date>.json`
- `reports/closing/<date>.md`
- `reports/closing/<date>.html`
- `reports/closing/<date>.publish-result.json`

## 当前执行命令

使用内置 fixture 做 dry-run：

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/reports/closing/run.mjs --tradingDate 2026-03-11 --mode manual --dryRun true --publish false
```

使用实时/外部快照文件：

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/reports/closing/run.mjs \
  --tradingDate 2026-03-11 \
  --mode manual \
  --dryRun true \
  --publish false \
  --sourceMode files \
  --quotesFile /path/to/quotes.json \
  --sectorsFile /path/to/sectors.json \
  --klineFile /path/to/kline.json \
  --newsFile /path/to/news.json
```

说明：

- 指数与 K 线可直接用实时快照驱动。
- 若板块或消息面不可达，允许标记为 `partial`，但必须在 `sources` 与摘要中明确说明。
