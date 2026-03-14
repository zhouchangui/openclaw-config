# AGENT_GOVERNANCE.md - 多智能体通用治理约束

## 适用范围

适用于 `/Users/zcg/.openclaw/workspace/agents/` 下所有现有和未来新增的智能体工作区。

## 新增智能体默认要求

创建新智能体工作区时，至少应包含：
- `AGENTS.md`
- `SOUL.md`
- `USER.md`
- `HEARTBEAT.md`
- `memory/`

并且在 `AGENTS.md` 的 Session Startup 中加入：

```md
Read `../HEARTBEAT_STANDARD.md` — 多智能体 heartbeat / cron 统一规范
```

## Heartbeat / Cron 默认约束

- 默认采用 `HEARTBEAT_STANDARD.md` 作为定时治理基线
- 默认要求 heartbeat 提供：目标、执行项、安静条件、普通提醒条件、立即告警条件、输出规则
- 默认优先保持安静：无异常时回复 `HEARTBEAT_OK`
- 默认禁止把精确定时、明确产出型任务硬塞进 heartbeat

## 现有智能体改造要求

- 现有智能体应逐步补齐并对齐 `HEARTBEAT.md` 结构
- 现有智能体如采用 cron 主导模式，仍需保留 heartbeat 兜底策略
- 对定时机制的重大调整应优先更新文档，再调整调度
