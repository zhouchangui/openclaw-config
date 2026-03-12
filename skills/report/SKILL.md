---
name: report
description: HTML 报告发布工具。支持查询模板路径（resolve-template-path）与发布报告（publish）两个函数，基于智能体自带模板生成 HTML 报告并推送给订阅者。当需要生成并分发可视化报告（日报、周报、分析报告等 HTML 形式）时使用。
license: MIT
allowed-tools: Bash
metadata:
  type: platform-tool
---

# Report Skill（报告发布）

基于智能体自带 HTML 模板生成报告，上传后推送给订阅者。

## 模板约定

模板放在智能体资产目录的 `report-templates/<templateName>/` 下，至少包含：

- `index.html`（入口，可使用 `{{ key }}` 或 `{{ path.to.field }}` 占位符）
- `report.js`（可选；包含 `__REPORT_DATA__` 占位符时，自动注入 `reportData`）
- `styles.css`（样式）
- `vendor/`（本地依赖，禁止外链 CDN）

**硬性约束：**
- 禁止内联 CSS/JS；禁止外链 CDN（Chart.js 必须使用本地 `vendor/`）。
- 若模板存在 `{{ ... }}` 占位符，发布前会自动渲染并校验——任一占位符未填会直接报错并终止。
- `report.js` 中 `__REPORT_DATA__` 必须恰好出现一次。
- 单个 session turn 内最多只允许一次成功 `publish`；成功后复用返回的 `url/reportId`，禁止重复发布。

## 工作流（推荐）

```
resolve-template-path → publish
```

先调用 `resolve-template-path` 确认模板目录存在并拿到绝对路径，再用 `templatePath` 传给 `publish`。

---

## 函数一：查询模板路径

```bash
node /assets/skills/report/scripts/index.js resolve-template-path '{"template":"my-template"}'
```

返回：`{"success":true,"template":"my-template","templatePath":"/absolute/path/to/template"}`

**模板不存在时直接报错**，不会静默返回空路径。

---

## 函数二：发布报告

```bash
# title 和 summary 是顶层必填参数，不要放在 reportData 内
node /assets/skills/report/scripts/index.js publish '{
  "template": "my-template",
  "title": "报告标题（必填，顶层）",
  "summary": "一句话摘要（必填，顶层）",
  "reportData": { ... }
}'
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `templatePath` | ✓¹ | 模板目录绝对路径（由 `resolve-template-path` 返回的 `templatePath`） |
| `template` | ✓¹ | 模板名（`templatePath` 未提供时使用，内部自动 resolve） |
| `title` | ✓ | 报告标题 |
| `summary` | ✓ | 报告摘要 |
| `reportData` | - | 注入到模板的数据对象（替换 `__REPORT_DATA__` 和 `{{ path.to.field }}` 占位符） |
| `templateVars` | - | 字面量占位符字典，用于 `{{ 这里填写xxx }}` 这类键名 |
| `deliveries` | - | 指定分发目标列表；不填则推送给所有订阅者 |

> ¹ `templatePath` 与 `template` 二选一必填；`templatePath` 优先级更高。

返回：`{"success":true,"reportId":"...","url":"..."}`

## 认证方式

发布调用平台 API 时，优先级如下：

1. 若已提供 `AGENT_TOKEN`，直接使用 `Authorization: Bearer <token>`
2. 若未提供 `AGENT_TOKEN`，但提供了 `AGENT_APP_ID` + `AGENT_APP_SECRET`（或兼容变量 `DDM_APP_ID` + `DDM_APP_SECRET`），skill 会先调用：

```bash
POST /api/agent/auth
Authorization: Basic base64(appId:appSecret)
```

再自动复用返回的 JWT token 完成上传与发布。

说明：

- token 会在当前进程内按过期时间缓存，避免一次发布中重复换 token。
- 若两套凭据都缺失，会直接报错，不会静默降级。

## 存储配置

默认优先读取 skill 目录下的 `config.json`。

仓库建议做法：

- 提交 `config.example.json` 作为示例
- 本地复制为 `config.json`
- `config.json` 不入仓，只保留在开发机或部署环境

当前全局默认已切到 Cloudflare R2：

- bucket：`ddm`
- endpoint：`https://ba837bd5c663afbcf718a974031733e3.r2.cloudflarestorage.com`
- stable public base：`https://reports.bothub.run`

可通过环境变量覆盖：

- `REPORT_STORAGE_PROVIDER`
- `REPORT_R2_ENDPOINT`
- `REPORT_R2_BUCKET`
- `REPORT_R2_ACCESS_KEY_ID`
- `REPORT_R2_SECRET_ACCESS_KEY`
- `REPORT_PUBLIC_BASE_URL`
- `REPORT_KEY_PREFIX`

说明：

- 若检测到 `cloudflare-r2` 配置，报告静态文件会直接上传到 R2，并返回稳定公网 URL。
- 若未配置这组存储参数，则回退到平台 `/agent/storage/*` 上传链路。

## 参考资料

- 模板开发规范：`skills/report/references/html-report-guidelines.md`
- 示例模板：`skills/report/demo/weekly-ops-report/`
