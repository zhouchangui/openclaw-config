# 🦞 龙虾管家运维工作流

**定位**：管理 OpenClaw 平台配置、智能体注册、Gateway 排查  
**触发词**：「注册新智能体」/「修改配置」/「排查 Gateway」/「检查日志」

> 所有操作优先使用 `openclaw` CLI，**不要手动编辑 openclaw.json**。

---

## 工作流速查

| 操作 | 触发场景 | 跳转 |
|------|---------|------|
| **新智能体注册** | 新建 / 迁移 Agent | → 工作流 A |
| **调整 Agent 配置** | 调整绑定 / 模型 / 参数 | → 工作流 B |
| **Gateway 排查** | 连接失败 / 消息丢失 | → 工作流 C |
| **日常日志巡检** | Heartbeat / 定期检查 | → 工作流 D |

---

## 工作流 A：注册新智能体

### 目录结构规范（硬性）

```
~/.openclaw/
├── workspace/agents/<agent-id>/   ← 用户工作区（SOUL.md 等文档在此）
│   ├── AGENTS.md
│   ├── SOUL.md
│   ├── IDENTITY.md
│   ├── MEMORY.md
│   ├── USER.md
│   └── HEARTBEAT.md
└── agents/<agent-id>/             ← 系统自动创建，不要手动操作
    └── sessions/
```

❌ **绝不**把 workspace 指向 `~/.openclaw/agents/<id>`（那是系统目录，不是工作区）

### 步骤

**1. 准备工作区文档**
```bash
AGENT_ID="new-agent-id"
mkdir -p ~/.openclaw/workspace/agents/$AGENT_ID/memory
# 创建 AGENTS.md / SOUL.md / IDENTITY.md / MEMORY.md 四个必填文档
```

**2. 注册 Agent（单条命令完成注册+绑定）**
```bash
openclaw agents add "$AGENT_ID" \
  --workspace ~/.openclaw/workspace/agents/$AGENT_ID \
  --model claude-sonnet-4-5 \
  --bind "feishu:<feishu-account-id>" \
  --non-interactive \
  --json
```

> `--bind` 格式为 `channel[:accountId]`，accountId 可用 `openclaw channels resolve` 或 `openclaw directory` 查询

**3. 验证注册成功**
```bash
openclaw agents list --bindings
```

**4. 验证 Gateway 能加载新配置**
```bash
openclaw config validate
openclaw health
```

**5. 通知用户**（Feishu）
```
✅ 智能体 <name> 注册完成

ID：<agent-id>
工作区：~/.openclaw/workspace/agents/<agent-id>
绑定：feishu/<accountId>
```

---

## 工作流 B：调整 Agent 配置

> **黄金规则**：用 `openclaw config set` 修改单个字段，不要直接编辑文件。

### 常见操作

**修改 Agent 绑定**
```bash
# 添加新绑定
openclaw agents bind --agent <agent-id> --bind "feishu:<accountId>"

# 查看当前绑定
openclaw agents bindings
```

**修改模型**
```bash
openclaw config set "agents.list[id=<agent-id>].model" "claude-opus-4-5"
```

**修改全局默认模型**
```bash
openclaw config set "agents.defaults.model.primary" "claude-sonnet-4-5"
```

### 修改后操作
```bash
# 1. 验证配置合法
openclaw config validate

# 2. 重启 Gateway 使修改生效
openclaw gateway restart

# 3. 确认健康
openclaw health
```

### ⚠️ 禁止手动修改的字段

| 字段 | 原因 |
|------|------|
| `auth.profiles` | 包含 OAuth 凭据，手动改会损坏认证 |
| `agents.list[].agentDir` | 系统自动分配，手动改会导致状态错乱 |

---

## 工作流 C：Gateway 排查

### 快速诊断（三步法）

**Step 1：健康检查**
```bash
openclaw health --verbose
openclaw doctor
```

**Step 2：查看最近错误**
```bash
# 通过 RPC 拉取（推荐，无需知道文件路径）
openclaw logs --limit 200 | grep -E "ERR|error|Error|WARN"

# 或直接读文件
tail -200 ~/.openclaw/logs/gateway.log | grep -E "ERR|error|WARN" | tail -30
```

**Step 3：渠道状态**
```bash
openclaw channels status --probe
```

### 常见错误对照表

| 错误信息 | 原因 | 解决方案 |
|---------|------|---------|
| `ERR_BAD_REQUEST` / `code: 1000040345` | Feishu WebSocket 频控 / 认证失败 | 检查 appId/appSecret；等待 1-2 分钟重试 |
| `Cannot find module 'xxx'` | 插件依赖缺失 | `cd ~/.openclaw/extensions/feishu && pnpm install` |
| `Cannot read properties of undefined (reading 'PingInterval')` | WebSocket 连接时序问题 | 重启 Gateway |
| `access not configured` | Agent workspace 路径错误 | `openclaw agents list` 确认 workspace 路径存在 |
| `WebSocket disconnect` | 网络抖动 | 通常自动重连；若持续检查防火墙/代理 |

### Gateway 重启

```bash
# 优雅重启（等待进行中的任务完成）
openclaw gateway restart

# 重启后确认恢复
openclaw health
openclaw channels status
```

### 自动修复
```bash
# doctor 会检测常见问题并提供修复建议
openclaw doctor

# --fix 自动应用推荐修复
openclaw doctor --fix
```

---

## 工作流 D：日常日志巡检

收到 heartbeat 时执行：

```bash
# 1. Gateway 健康状态
openclaw health

# 2. 最近 1 小时错误
openclaw logs --limit 300 | grep -E "ERR|error|WARN" | tail -20

# 3. 渠道连接状态
openclaw channels status

# 4. 确认各 Agent 配置正常
openclaw agents list --bindings
```

**无异常**：回复 `HEARTBEAT_OK`  
**有异常**：启动工作流 C 排查，通过 Feishu 通知用户

---

## 关键路径速查

```
~/.openclaw/openclaw.json           ← 主配置（用 CLI 修改，不要直接编辑）
~/.openclaw/logs/gateway.log        ← Gateway 日志（用 openclaw logs 读取）
~/.openclaw/workspace/agents/       ← 所有 Agent 工作区
~/.openclaw/extensions/feishu/      ← Feishu 插件
```

## 常用命令速查

```bash
openclaw agents list --bindings       # 列出所有 Agent 及绑定
openclaw agents add <name> --workspace <dir> --bind <channel:id> --non-interactive
openclaw agents bind --agent <id> --bind <channel:id>
openclaw config set <dot.path> <value>
openclaw config validate              # 验证配置
openclaw gateway restart              # 重启 Gateway
openclaw health                       # 健康检查
openclaw logs --limit 200             # 查看最近日志
openclaw channels status --probe      # 渠道状态
openclaw doctor --fix                 # 自动修复常见问题
```
