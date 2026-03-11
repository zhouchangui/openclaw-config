# publish-sop.md

## 标准发布 SOP

所有报告统一走以下流程：

```text
准备参数 → 获取数据 → 归一化 JSON → 校验字段 → 生成 Markdown → 生成 HTML → 上传 OSS → 发送飞书摘要 + 链接 → 归档结果
```

---

## Canonical 路径

运行时只使用以下目录：

- `data/<report-type>/`
- `reports/<report-type>/`
- `report-templates/<template-name>/`
- `report-runtime/`

发布结果文件统一命名为：

```text
reports/<report-type>/<date-or-slot>.publish-result.json
```

---

## 统一 CLI 入口

标准执行入口：

```bash
node report-runtime/cli/run-report.mjs \
  --reportType <closing|morning|news> \
  --tradingDate <YYYY-MM-DD> \
  --slot <YYYY-MM-DD-am> \
  --mode <manual|scheduled> \
  --dryRun <true|false> \
  --publish <true|false>
```

本地三报告回归入口：

```bash
node report-runtime/cli/run-all-dry.mjs --tradingDate <YYYY-MM-DD>
```

这些 CLI 以及三个直接报告入口现在都会自动读取 workspace 根目录下的 `.env` 与 `.env.local`。
建议：

- 非敏感默认值放 `.env`
- Access Key / webhook / secret 放 `.env.local`

---

## Step 1：准备参数

最少参数：
- `reportType`
- `tradingDate`
- `mode`（manual|scheduled）
- `publish`（true|false）

可选参数：
- `dryRun`
- `forcePartial`
- `outputDir`

---

## Step 2：获取数据

按报告类型拉取对应数据。

### morning
- 隔夜美股
- 恒指/A50/汇率/商品（如可得）
- 今日政策与事件
- 今日关注方向

### closing
- 三大指数
- 成交额
- 板块强弱
- 技术面指标
- 当日重要消息

### news
- 当日重点新闻
- 宏观/政策/行业/公司事件
- 影响对象与影响层级

---

## Step 3：归一化 JSON

输出到：

```text
data/<report-type>/<date-or-slot>.json
```

要求：
- 必须符合共享 schema
- 必须写明 sources 状态
- 必须写明 fallbackLevel

---

## Step 4：校验字段

校验失败时：
- 缺少关键字段：进入 `partial` 或 `failed`
- 缺少非关键字段：继续，但写入降级说明

---

## Step 5：生成 Markdown

输出到：

```text
reports/<report-type>/<date-or-slot>.md
```

用途：
- 审阅
- 快速回看
- HTML 失败时保底发送

---

## Step 6：生成 HTML

输出到：

```text
reports/<report-type>/<date-or-slot>.html
```

要求：
- 模板仅消费标准化 JSON
- 模板不直接抓数据
- 渲染失败时不能阻塞 Markdown 输出

---

## Step 7：上传 OSS

上传成功后记录：
- `url`
- `bucket`
- `path`
- `uploadedAt`

上传失败时：
- 保留本地 HTML
- 状态记为 `partial`
- 飞书只发文本摘要或提示稍后补发

真实发布所需环境变量：

- `OSS_PROVIDER`（默认 `oss`；若使用火山引擎 TOS 则填 `tos`）
- `OSS_BUCKET`
- `OSS_REGION`
- `OSS_ACCESS_KEY_ID`
- `OSS_ACCESS_KEY_SECRET`

可选：

- `OSS_PUBLIC_BASE_URL`
- `OSS_UPLOAD_BASE_URL`
- `OSS_PREFIX`
- `OSS_OBJECT_ACL`

火山引擎 TOS 约定：

- `OSS_PROVIDER=tos`
- endpoint 形如 `tos-<region>.volces.com`
- 默认对象路径可用 `OSS_PREFIX=clawreport`
- 当前实现走 `TOS4-HMAC-SHA256`

若 `publish=true` 且 `dryRun=false` 时缺少必填 OSS / 飞书凭据，当前实现会：

- 先写出失败态 `publish-result`
- 再报错并要求补齐凭据

---

## Step 8：发送飞书摘要 + 链接

飞书消息只负责：
- 报告标题
- 一句话结论
- 3 条摘要
- 完整报告链接

不要把整篇 HTML 内容塞进消息正文。

真实发送至少需要：

- `FEISHU_BOT_WEBHOOK`

如机器人启用了加签，再额外提供：

- `FEISHU_BOT_SECRET`

---

## Step 9：归档

记录：
- 输入 JSON
- Markdown
- HTML
- `publish-result`
- 发送结果

便于后续排错与复盘。
