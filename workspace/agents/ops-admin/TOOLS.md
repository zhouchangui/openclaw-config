# TOOLS.md - 龙虾管家工具速查

## OpenClaw 关键路径

```
~/.openclaw/openclaw.json           主配置（CLI 修改，不要直接编辑）
~/.openclaw/logs/gateway.log        Gateway 日志
~/.openclaw/workspace/agents/       所有 Agent 工作区
~/.openclaw/extensions/feishu/      Feishu 插件（pnpm install 安装依赖）
~/.openclaw/agents/                 系统运行时目录（不要手动操作）
```

## openclaw CLI 速查

```bash
# Agent 管理
openclaw agents list --bindings
openclaw agents add <name> --workspace <dir> --bind feishu:<id> --non-interactive
openclaw agents bind --agent <id> --bind feishu:<accountId>

# 配置管理
openclaw config set <dot.path> <value>
openclaw config validate

# Gateway
openclaw gateway restart
openclaw gateway status
openclaw health --verbose

# 日志
openclaw logs --limit 200
openclaw logs --follow

# 渠道
openclaw channels status --probe
openclaw channels list

# 诊断
openclaw doctor
openclaw doctor --fix
```

## 当前 Agent 列表

| ID | 名称 | 飞书账号 | 工作区 |
|----|------|---------|--------|
| dingding-assistant | 盯钉喵开发运营助理 | cli_a93a959ece799bef | workspace/agents/dingding-assistant |
| investment-advisor | 我的理财助手 | cli_investment | workspace/agents/investment-advisor |
| ops-admin | 龙虾管家 | cli_ops | workspace/agents/ops-admin |

## Gateway 进程

- 服务名：`openclaw-gateway`（macOS launchd 管理）
- 默认端口：18789（loopback only）
- 重启：`openclaw gateway restart`（优雅重启，等待进行中任务完成）
