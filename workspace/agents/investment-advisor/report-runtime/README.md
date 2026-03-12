# report-runtime

`report-runtime/` 是市场报告系统的 Node 运行时目录。

职责：

- 统一路径解析
- 读写 JSON / Markdown / HTML 产物
- 校验共享 report schema
- 根据模板生成本地 HTML 归档
- 写出 `publish-result`
- 调用共享 `report` skill 发布到 DDM 平台
- 适配外部数据源并做 dry-run smoke test

统一入口：

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/cli/run-report.mjs --reportType closing --tradingDate 2026-03-11 --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-all-dry.mjs --tradingDate 2026-03-11
```

环境变量加载：

- `report-runtime/cli/run-report.mjs`
- `report-runtime/cli/run-all-dry.mjs`
- `report-runtime/reports/{closing,morning,news}/run.mjs`

以上入口现在都会自动读取 workspace 根目录下的：

1. `.env`
2. `.env.local`

规则：

- `.env.local` 会覆盖 `.env` 中的同名键
- 已经存在于系统环境中的变量优先级最高，不会被文件覆盖
- 推荐把敏感信息放进 `.env.local`

发布相关：

- `lib/report-skill-publish.mjs`：调用共享 `report` skill 获取 DDM 报告地址
- `lib/publish-flow.mjs`：统一处理 dry-run / publish / publish-result

真实发布所需环境变量：

- `AGENT_TOKEN`
- 或 `AGENT_APP_ID` + `AGENT_APP_SECRET`

可选环境变量：

- `PLATFORM_BASE_URL`（默认回退到本地平台地址）
- `REPORT_SKILL_SCRIPT_PATH`（覆盖共享 report skill 脚本路径）
- `DDM_APP_ID` / `DDM_APP_SECRET`（兼容别名）

基础 smoke test：

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/smoke/runtime-foundation.smoke.mjs
node report-runtime/smoke/source-adapters.smoke.mjs
node report-runtime/smoke/closing-pipeline.smoke.mjs
node report-runtime/smoke/morning-pipeline.smoke.mjs
node report-runtime/smoke/news-pipeline.smoke.mjs
node report-runtime/smoke/cli-contract.smoke.mjs
node report-runtime/smoke/publish-dry-run.smoke.mjs
node report-runtime/smoke/env-loading.smoke.mjs
node report-runtime/smoke/report-skill-auth.smoke.mjs
```

约束：

- 默认不引入额外 npm 依赖
- 模板只消费标准 JSON，不直接抓数据
- 缺失字段必须显式标记为 `partial`
