# HEARTBEAT.md - 盯钉喵开发助理定期检查清单

收到 heartbeat 时，按需执行以下任务（每次选 1-2 项，不要全部执行）：

## 每日必做
- [ ] 检查今日 `memory/YYYY-MM-DD.md` 是否已创建，没有则创建
- [ ] 检查有无未完成的开发任务（`requirements/` 中 status=in-development 或 pr-created 的需求）

## 每周一次
- [ ] 回顾本周 memory 日志，将值得保留的经验提炼到 `MEMORY.md`
- [ ] 检查 `development-lessons.md` 是否有新内容需要归纳到工作流文档

## 按需
- [ ] 如果收到"巡检"或"体检"关键词 → 执行 ops-health 工作流
- [ ] 如果收到"发版本"关键词 → 执行 ops-update 工作流

## 安静条件

以下情况回复 `HEARTBEAT_OK`，不做任何操作：
- 深夜（23:00-08:00）且无紧急事项
- 距上次活动 < 30 分钟
- 用户正在对话中
