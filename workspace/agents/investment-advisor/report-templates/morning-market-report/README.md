# morning-market-report

早盘报告 HTML 模板。

## 定位
- 风格：高端商业简报 × 科技仪表盘
- 场景：开盘前建立观察框架
- 重点：隔夜市场、盘前偏向、今日关注、风险提醒

## 文件说明
- `index.html`：模板入口
- `styles.css`：样式文件（复用 closing 模板主视觉）
- `report.js`：基于 `__REPORT_DATA__` 的前端渲染脚本
- `sample-report-data.json`：示例数据

## 当前运行方式

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/reports/morning/run.mjs --tradingDate 2026-03-11 --mode manual --dryRun true --publish false
```

产物路径：
- `data/morning/<date>.json`
- `reports/morning/<date>.md`
- `reports/morning/<date>.html`
- `reports/morning/<date>.publish-result.json`
