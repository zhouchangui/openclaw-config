# MEMORY - Historical Conversation & Context Summary

## 历史排错与结构重整经验总结 (记录时间: 2026-03-11)

### 1. 飞书通道连接错误 (Feishu Connection Error)
- **现象**：`gateway.log` 中反复出现 `code: 1000040345, system busy`, `ERR_BAD_REQUEST` 以及 `Cannot read properties of undefined (reading 'PingInterval')` 错误。
- **原因与排查**：这通常与飞书 WebSocket 建立连接时的认证信息、频控或网络环境波动有关。此外发现飞书插件内部代码结构及配置的依赖。
- **改进方案**：我们新增了 `ops` 飞书配置（包含对应的 `appId` 和 `appSecret`），并将其与“龙虾管家 (`ops-admin`)”绑定（配置在 `openclaw.json` 的 `bindings` 及 `channels` 中）。以此作为专门的监控预警和通讯通道。

### 2. OpenClaw 智能体工作区 (Workspace) 目录混乱修复
- **历史乱象**：根目录 `~/.openclaw/` 及下层散落了各个智能体生成的错误或者不规范的工作区。例如 `investment-advisor` 直接映射并覆盖在了底层系统专用目录 `agents/investment-advisor` 上；`ops-admin` 则生成了顶层单独的 `workspace-ops-admin`；另外遗留了测试错误的 `agents/main` 目录。
- **架构规范总结**：在 OpenClaw 中，智能体的底层架构严格划分为以下两层：
  - **系统级环境目录**：定义在 `~/.openclaw/agents/<agent-id>/`（包含系统生成的 `agent` 环境配置文件和 `sessions` 对话历史）。该目录无需在 `openclaw.json` 中强行写入，系统会自动寻找。
  - **用户/可视化工作区 (Workspace)**：定义在 `~/.openclaw/workspace/agents/<agent-id>/`（存放诸如 `IDENTITY.md`, `SOUL.md`, `MEMORY.md` 等供大模型读取解析的性格上下文与记忆知识片段）。
- **执行的修复结果**：
  1. 对配置文件 `~/.openclaw/openclaw.json` 进行了精简统筹：将所有智能体的 `workspace` 指定到规范的高内聚路径 `/Users/zcg/.openclaw/workspace/agents/<agent_id>` 中。
  2. 收拢了旧文件并彻底清退了位于 `/Users/zcg/.openclaw/workspace/` 根目录下的所有散乱文件（仅保留标准的 `agents/` 子目录体系）。

**经验教训**：这部分记忆应当作为未来在 OpenClaw 中创建、管理和初始化其他智能体时的重要底线原则和历史参考，绝不能违背标准的文件和结构体规范！
