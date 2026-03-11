# skills/README.md

这里存放“我的理财助手”的报告技能入口。

## 当前技能

- `morning-report`：早盘报告
- `closing-report`：收盘报告
- `news-report`：消息面报告

## 设计原则

- 每个报告一个技能入口
- 共享 schema / SOP / 发布约定统一放在 `report-specs/`
- 技能负责说明“何时用、怎么跑、写什么、如何降级”
- 定时任务未来只调用技能，不直接拼正文

## 推荐调用顺序

1. 先读对应技能 `SKILL.md`
2. 再读 `report-specs/shared-schema.md`
3. 若涉及发布，再读 `report-specs/publish-sop.md`
4. 若涉及定时任务接线，再读 `report-specs/task-wiring.md`

## 当前统一执行入口

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/cli/run-report.mjs --reportType closing --tradingDate 2026-03-11 --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-report.mjs --reportType morning --tradingDate 2026-03-11 --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-report.mjs --reportType news --slot 2026-03-11-am --mode scheduled --dryRun true --publish false
node report-runtime/cli/run-all-dry.mjs --tradingDate 2026-03-11
```
