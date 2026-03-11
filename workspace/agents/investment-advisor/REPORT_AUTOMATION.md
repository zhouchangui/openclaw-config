# REPORT_AUTOMATION.md

## 目标

将“我的理财助手”固化为一个**标准化市场报告系统**，支持以下三类报告的稳定生成、复用与定时执行：

- `morning-report`：早盘报告
- `closing-report`：收盘报告
- `news-report`：消息面报告

每类报告都采用：

1. **共享输入规范**
2. **独立技能说明**
3. **独立模板目录**
4. **统一发布约定**
5. **统一错误降级策略**
6. **统一 CLI 入口**

---

## 当前活动路径（canonical）

当前只维护以下活动目录：

- `data/`
- `reports/`
- `report-templates/`
- `report-runtime/`

说明：

- `projects/investment/` 属于旧版自动交易路线遗留，仅作历史参考，不再继续扩展。
- `reports/monitor_20260311.md` 保留为历史审计证据，但不再纳入当前报告主线。

---

## 标准执行链路

所有报告统一走下面这条链路：

```text
调用 run-report CLI → 抓取/装载数据 → 清洗/归一化 → 生成 report-data.json → 渲染 HTML → 上传/发布 → 发送飞书摘要 + 链接
```

### 产物要求

每次任务至少产生以下文件或对象：

- `data/<report-type>/<date>.json`：标准化输入数据
- `reports/<report-type>/<date>.md`：文本版归档（便于审查）
- `reports/<report-type>/<date>.html`：HTML 报告
- `reports/<report-type>/<date-or-slot>.publish-result.json`：发布结果与 URL（如已启用 OSS）

---

## 共享目录规范

```text
investment-advisor/
  REPORT_AUTOMATION.md
  report-specs/
    shared-schema.md
    publish-sop.md
    task-wiring.md
  skills/
    morning-report/
      SKILL.md
    closing-report/
      SKILL.md
    news-report/
      SKILL.md
  report-templates/
    morning-market-report/
    closing-market-report/
    news-market-report/
  report-runtime/
  data/
    morning/
    closing/
    news/
  reports/
    morning/
    closing/
    news/
```

---

## 错误降级策略

当数据源不完整或上传失败时，统一按下面策略执行：

### L1：部分数据缺失
- 允许继续生成报告
- 缺失字段显示“暂缺 / 未获取到”
- 在摘要中提示“部分数据待补齐”

### L2：技术面数据缺失
- 允许继续生成内容版报告
- 技术图区隐藏或替换为“技术数据暂不可用”
- 不影响文本摘要与市场结构判断

### L3：HTML 渲染失败
- 保底输出 Markdown 文本版
- 记录失败原因
- 如定时任务触发，飞书只发送文本摘要

### L4：OSS 上传失败
- 本地保留 HTML 与 JSON
- 飞书摘要提示“完整页暂未发布成功”
- 不阻塞文本版发送

---

## 定时任务接入原则

后续定时任务不应直接拼接报告正文，而应只负责：

1. 选择报告类型
2. 触发对应技能
3. 传入日期/时段/模式等参数
4. 获取最终输出结果
5. 执行发送

也就是说，**定时任务只调技能，不直接写报告。**

---

## 当前状态

已完成：
- 收盘报告 HTML 原型 v0.2
- 技术面增强（K 线 / MA / 成交量 / MACD）
- 报告体系与模板风格统一
- `shared-schema.md` / `publish-sop.md` / `task-wiring.md` 三份共享约定文档
- 活动路径已统一到 `data/`、`reports/`、`report-templates/`、`report-runtime/`
- `morning` / `closing` / `news` 三条 dry-run 流水线
- 统一 CLI：`report-runtime/cli/run-report.mjs` 与 `run-all-dry.mjs`
- 发布层支持 OSS 与火山引擎 TOS（`OSS_PROVIDER=tos`）

待打通闭环：
- live publish（OSS / Feishu）
- 凭据就绪后的 staging 验证

## 当前可运行命令

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/cli/run-report.mjs --reportType closing --tradingDate 2026-03-11 --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-report.mjs --reportType morning --tradingDate 2026-03-11 --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-report.mjs --reportType news --slot 2026-03-11-am --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-all-dry.mjs --tradingDate 2026-03-11
```
