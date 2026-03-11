# HEARTBEAT.md - 龙虾管家巡检清单

## 每次 Heartbeat 执行

```bash
# 1. Gateway 健康状态
openclaw health

# 2. 最近错误
openclaw logs --limit 200 | grep -E "ERR|error|WARN" | tail -10

# 3. 渠道状态
openclaw channels status
```

**无异常** → 回复 `HEARTBEAT_OK`  
**有异常** → 执行 OPS_WORKFLOW.md 工作流 C，通过飞书通知用户

## 每日一次（上午）

- `openclaw agents list --bindings` — 确认 3 个 agent 全部在线
- 检查昨天 memory 文件是否记录了异常

## 触发立即通知的条件

- Gateway 进程不响应（openclaw health 超时）
- 任意 Feishu 账号断连超过 5 分钟
- 错误日志中出现新的未知 ERR 类型
