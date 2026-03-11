# closing-market-report

收盘报告 HTML 模板原型。

## 定位
- 风格：高端商业简报 × 科技仪表盘
- 设备：手机 / 桌面双端均衡
- 主题：A 股为主，兼顾外围映射
- 强调色：品牌橙

## 文件说明
- `index.html`：模板入口
- `styles.css`：样式文件
- `report.js`：基于 `__REPORT_DATA__` 的前端渲染脚本
- `sample-report-data.json`：示例数据，可用于后续接真实发布链路

## 与参考实现保持一致的点
- 不内联 CSS / JS
- 使用 `__REPORT_DATA__` 占位符，方便后续接入发布器
- HTML / CSS / JS 分离

## 后续可接入方向
1. 将 `sample-report-data.json` 替换为定时任务生成的结构化 JSON
2. 上传到 OSS 后，把飞书消息改成“摘要 + 卡片链接”
3. 后续如果需要，可扩展为：
   - 早盘报告模板
   - 消息面报告模板
   - 导出截图 / PDF

## 当前运行方式

使用 fixture dry-run：

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/reports/closing/run.mjs --tradingDate 2026-03-11 --mode manual --dryRun true --publish false
```

使用外部快照文件：

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

产物路径：

- `data/closing/<date>.json`
- `reports/closing/<date>.md`
- `reports/closing/<date>.html`
- `reports/closing/<date>.publish-result.json`
