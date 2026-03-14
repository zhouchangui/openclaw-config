# HEARTBEAT.md - 龙虾管家巡检清单

## 目标
本智能体的 heartbeat 用于 OpenClaw 平台运维巡检、异常发现和告警，不负责替代完整发布、配置变更或一次性复杂排障流程。

## 每次 Heartbeat 执行
```bash
# 1. Gateway 健康状态
openclaw health

# 2. 最近错误
openclaw logs --limit 200 | grep -E "ERR|error|WARN" | tail -10

# 3. 渠道状态
openclaw channels status
```

## 安静条件
以下情况回复 `HEARTBEAT_OK`：
- Gateway 健康状态正常
- 最近日志中没有新的高风险错误
- 渠道状态无异常
- 没有触发立即通知条件

## 普通提醒条件
以下情况主动提醒用户：
- 检查中发现可恢复但尚未扩大影响的 WARN / error
- 某个渠道状态异常，但尚未确认持续超过 5 分钟
- 发现前一天 memory 未记录异常复盘，建议补记

## 立即告警条件
以下情况必须立即通知用户：
- Gateway 进程不响应或 `openclaw health` 超时
- 任意 Feishu 账号断连超过 5 分钟
- 错误日志中出现新的未知 ERR 类型
- 巡检发现影响多智能体正常工作的系统级故障

## 输出规则
- 无异常：回复 `HEARTBEAT_OK`
- 普通事项：简短说明问题、影响和建议动作
- 严重异常：直接告警，并附带建议排查动作

## 每日一次（上午）
- `openclaw agents list --bindings` — 确认关键 agent 在线
- 检查昨天 memory 文件是否记录了异常
