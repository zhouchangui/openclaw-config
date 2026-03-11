# 理财助手报告系统进度汇报（2026-03-11）

## 一、文档目的

这份文档用于记录“我的理财助手”市场报告系统的当前进度、已完成成果、剩余运维事项，以及后续最优收口路径。

目标是避免状态只存在于对话里，方便后续继续推进时直接接上，不再重复梳理上下文。

---

## 二、当前唯一活动路径

后续收口只围绕下面四个目录继续推进：

- `data/`
- `reports/`
- `report-templates/`
- `report-runtime/`

补充说明：

- `projects/investment/` 属于旧版自动交易遗留，只保留历史参考价值。
- `reports/monitor_20260311.md` 保留为审计记录，但不再作为当前主线报告的一部分。

---

## 三、当前总体结论

截至 2026-03-11 当前时点，这项工作可以概括为：

> **三类报告的模板、运行时、统一 CLI 与发布适配层已经打通，当前剩余的是带真实凭据的 staging / production 验证。**

如果拆成三层来看：

- **报告定位与结构层**：已完成
- **标准化文档与技能层**：已完成
- **自动化执行与发布层**：已完成 dry-run 与本地集成验证

因此，这项工作目前处于：

> **“系统已落地，可执行；剩余主要是运维接线与真实环境验证”**

的状态。

---

## 四、已经完成的工作

## 1. 理财助手定位重构完成

已将理财助手从原先偏“交易/风控/执行”的方向，重构为：

> **市场报告系统**

当前聚焦三类核心报告：

- 早盘报告
- 收盘报告
- 消息面报告

已明确删除或弱化以下旧方向：

- 自动交易
- 止盈止损执行
- 盘中异动监控
- 买卖动作描述
- 伪实盘工作流

这一点已经落实到工作流文档中。

---

## 2. 三类报告体系已设计完成

已完成三类报告的结构化设计，包括：

### 早盘报告
目标：帮助用户在开盘前建立当天市场观察框架。

### 收盘报告
目标：帮助用户在收盘后理解市场结构、主线、风格和技术确认。

### 消息面报告
目标：帮助用户过滤噪音，抓住真正影响市场理解的关键消息。

这三类报告的结构与输出风格已在模板文档中明确。

---

## 3. 报告风格与模板体系已完成

已完成：

- `REPORT_TEMPLATES.md`

该文件已经明确：

- 统一采用 **结论先行 + 依据展开**
- 强调 **变化**，而不是堆信息
- 强调 **筛选**，而不是搬运新闻
- 统一三类报告的骨架与辨识度

---

## 4. 收盘报告 HTML 原型已完成

已完成收盘报告 HTML 模板原型，目录如下：

```text
report-templates/closing-market-report/
```

已存在文件：

- `index.html`
- `styles.css`
- `report.js`
- `sample-report-data.json`
- `README.md`

并已做出两个阶段版本：

### v0.1
基础版：高端商业简报风 × 科技仪表盘风

### v0.2
技术面增强版，新增：
- 上证指数
- 深证成指
- 创业板指
- K线蜡烛图
- MA5 / MA10 / MA20
- 成交量柱
- MACD
- 每个指数单独技术面摘要

该模板已做本地预览验证，说明页面方向已经确认可行。

---

## 5. 真实数据示范报告已生成过一次

已基于公开真实数据生成过一轮示范报告，并验证了：

- 早盘报告（回放版）
- 收盘报告
- 消息面报告

这说明报告内容结构和数据映射方向本身是成立的。

---

## 6. 标准化自动化文档已建立

已新增：

- `REPORT_AUTOMATION.md`

其内容已固定：

- 报告自动化目标
- 目录规范
- 标准执行链路
- 错误降级策略
- 定时任务接入原则

这份文档是当前整个报告系统自动化的总说明。

---

## 7. 共享规范层已建立

已新增：

- `report-specs/shared-schema.md`
- `report-specs/publish-sop.md`
- `report-specs/task-wiring.md`

这些文件已经完成以下固定：

### `shared-schema.md`
定义三类报告共享字段、状态、fallback 规则、来源字段等。

### `publish-sop.md`
定义标准发布流程：

```text
抓数据 → 归一化 JSON → 校验 → Markdown → HTML → 上传 OSS → 飞书摘要 + 链接 → 归档
```

### `task-wiring.md`
定义未来定时任务如何调用技能，而不是直接拼正文。

---

## 8. 已固化为“每个报告一个技能入口”

已新增：

- `skills/morning-report/SKILL.md`
- `skills/closing-report/SKILL.md`
- `skills/news-report/SKILL.md`
- `skills/README.md`

这部分已经满足以下目标：

- 每个报告一个技能
- 标准化入口
- 固定执行流程
- 固定必写内容
- 固定降级规则
- 固定产物路径

也就是说，报告系统已经不只是“文档和模板”，而是已经开始进入**技能化组织方式**。

---

## 9. 顶层工作流文档已接入这些标准化入口

已更新：

- `INVESTMENT_WORKFLOW.md`

并将其与下面这些标准化文件挂接：

- `REPORT_AUTOMATION.md`
- `report-specs/shared-schema.md`
- `report-specs/publish-sop.md`
- `skills/README.md`

这样后续理财助手读取工作区时，可以更自然走标准化路径，而不是重新自由发挥。

---

## 10. 已完成多次 git 提交

当前这些工作并非临时态，而是已经写入 git 历史。

说明：
- 工作区成果已可追踪
- 状态已沉淀
- 后续可以在此基础上继续推进

---

## 五、当前已打通的工程闭环

当前已经存在并通过验证的能力：

1. `closing` / `morning` / `news` 三条报告流水线均可独立执行
2. 三条流水线均可输出：
   - 标准 JSON
   - Markdown
   - 自包含 HTML
   - `publish-result.json`
3. 统一 CLI 已落地：
   - `report-runtime/cli/run-report.mjs`
   - `report-runtime/cli/run-all-dry.mjs`
4. 发布适配层已落地：
   - `report-runtime/lib/oss-upload.mjs`
   - `report-runtime/lib/notify-feishu.mjs`
   - `report-runtime/lib/publish-flow.mjs`
5. 已验证：
   - runtime foundation smoke
   - source adapters smoke
   - closing / morning / news pipeline smoke
   - CLI contract smoke
   - publish dry-run + 本地伪服务集成 smoke

---

## 六、当前仍需人工确认的事项

现在剩下的不是“还没开发”，而是“需要带真实环境参数去确认”：

### 1. 真实发布凭据

真实发布需要提供：

- `OSS_BUCKET`
- `OSS_REGION`
- `OSS_ACCESS_KEY_ID`
- `OSS_ACCESS_KEY_SECRET`
- `FEISHU_BOT_WEBHOOK`

可选：

- `OSS_PUBLIC_BASE_URL`
- `OSS_UPLOAD_BASE_URL`
- `OSS_PREFIX`
- `OSS_OBJECT_ACL`
- `FEISHU_BOT_SECRET`

若 `publish=true` 且 `dryRun=false` 时缺少必填凭据，系统现在会：

- 先写出失败态 `publish-result.json`
- 再直接报错，要求补齐凭据

### 2. 真实环境联调

还需要在 staging / production 环境完成一次真实联调，确认：

- OSS 路径与公网 URL 是否符合预期
- 飞书机器人 webhook 是否可用
- 如启用了加签，`FEISHU_BOT_SECRET` 是否正确
- 调度器传参是否符合 `run-report.mjs` 约定

### 3. 定时任务接线

调度规则已经明确，但是否真正接入生产 cron / scheduler，属于运维动作，不再是代码缺口。

---

## 七、推荐的运行命令

### 单报告 dry-run

```bash
node report-runtime/cli/run-report.mjs --reportType closing --tradingDate 2026-03-11 --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-report.mjs --reportType morning --tradingDate 2026-03-11 --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-report.mjs --reportType news --slot 2026-03-11-am --mode scheduled --dryRun true --publish false
```

### 三报告回归

```bash
node report-runtime/cli/run-all-dry.mjs --tradingDate 2026-03-11
```

### 发布 dry-run

```bash
node report-runtime/cli/run-report.mjs --reportType closing --tradingDate 2026-03-11 --mode scheduled --dryRun true --publish true
```

---

## 八、当前最值得推进的一步

如果接下来只做一件事，最值得做的是：

> **在真实 OSS / 飞书凭据下跑一次 staging 发布，确认最终 URL、消息体与调度器参数。**

因为代码侧闭环已经存在，接下来最有价值的信息来自真实环境验证，而不是继续补内部模板。

---

## 十、最简短结论

一句话总结当前状态：

> **三类市场报告已经具备统一生成与发布能力；下一步重点是拿真实凭据完成环境联调。**

---

**文档生成时间**：2026-03-11 17:10（Asia/Shanghai）  
**整理人**：龙虾管家 🦞
