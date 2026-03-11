---
name: closing-report
description: Use when generating or scheduling A-share-focused closing reports that summarize index moves, sector rotation, technical signals, and next-session watch points after market close.
---

# closing-report

## 单一入口定位

`closing-report` 是 **标准化收盘报告** 的唯一 skill 入口。

- 所有“收盘复盘 / 盘后总结 / 技术面收口”的任务都应先调用这个 skill。
- cron 只应说明“按 closing-report 的 SOP 生成并发送”，不再嵌入命令细节。

## 适用场景

- 用户要求生成收盘报告或盘后复盘
- 交易日收盘后的定时任务
- 需要输出指数结构、技术面确认、板块强弱与次日观察点

## 输入参数

- `tradingDate`：交易日，格式 `YYYY-MM-DD`
- `mode`：`manual` / `scheduled`
- `dryRun`：是否只生成本地产物，默认 `false`
- `publish`：是否发布 HTML 并生成 URL，默认 `true`
- `sourceMode`：默认 `live`；必要时可切换为 `files`

## 固定 SOP

1. 确认目标交易日，并以真实收盘数据作为唯一依据。
2. 获取指数、成交额、板块强弱、K 线、MA、成交量、MACD 等结构信息；涉及消息面时，新闻切片必须使用真实来源。
3. 在工作目录中使用 `exec` 运行统一 CLI，生成 report-data、Markdown、HTML 与发布结果。
4. 读取 stdout JSON，核对标题、结论、技术面摘要、结构判断、观察点与发布 URL。
5. 若技术面或板块数据有缺口，必须按降级规则诚实标注，不能伪造 MACD / K 线。
6. 若需要发送，只返回标题、结论、完整链接三行。

## 最终回复合同

- 第 1 行：报告标题
- 第 2 行：一句话结论
- 第 3 行：完整报告：`<url>`

若本次未发布 HTML，必须明确说明只生成本地文件，不能伪造外部链接。

## 产物合同

- `data/closing/<tradingDate>.json`
- `reports/closing/<tradingDate>.md`
- `reports/closing/<tradingDate>.html`
- `reports/closing/<tradingDate>.publish-result.json`

## 降级规则

- 若技术面数据缺失：去掉技术图区，保留文字版收盘报告
- 若板块数据缺失：保留指数与结构判断，但明确标注“板块数据暂缺”
- 若 HTML 失败：保底输出 Markdown
- 若上传失败：保留本地文件，不伪造 URL
- 若发送失败：显式返回失败信息

## 禁止事项

- 不伪装成自动交易系统
- 不输出买卖动作
- 不强行解释所有涨跌
- 不在缺少技术数据时伪造 MACD / K 线
- 不在 cron 文案中复制内部执行命令

## 内部执行器

当需要实际生成报告时，在工作目录中运行统一 CLI：

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
FEISHU_BOT_WEBHOOK= FEISHU_BOT_SECRET= \
node report-runtime/cli/run-report.mjs \
  --reportType closing \
  --tradingDate <YYYY-MM-DD> \
  --mode <manual|scheduled> \
  --dryRun <true|false> \
  --publish <true|false> \
  --sourceMode <live|files>
```

说明：

- 如需受控回放，可额外传入 `--quotesFile` / `--sectorsFile` / `--klineFile` / `--newsFile`。
- 私聊发送优先，不依赖群 webhook。

## 验证清单

- 是否给出技术面与结构判断，而不是简单涨跌回顾
- 若技术或板块缺失，是否诚实降级
- 是否保留明日观察点与风险提示
- 最终回复是否严格三行
