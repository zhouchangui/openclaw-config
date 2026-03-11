# news-market-report

消息面报告 HTML 模板。

## 定位
- 风格：高端商业简报 × 筛选看板
- 场景：早晨固定时段或重大事件后
- 重点：筛选、影响路径、持续跟踪、噪音过滤

## 当前运行方式

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/reports/news/run.mjs --slot 2026-03-11-am --mode manual --dryRun true --publish false
```

产物路径：
- `data/news/<slot>.json`
- `reports/news/<slot>.md`
- `reports/news/<slot>.html`
- `reports/news/<slot>.publish-result.json`
