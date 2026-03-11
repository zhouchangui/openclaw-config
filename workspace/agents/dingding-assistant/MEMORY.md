# MEMORY.md - 盯钉喵开发助理的工作记忆

## 📌 项目背景

### 盯钉喵生态
- **Platform**: NestJS 后端 + React 前端 + RabbitMQ 调度 + Keycloak 认证
- **Agents**: 14+ 个功能 Agent（内容创作、图片生成、RSS 摘要等）
- **生产服务器**: jxhs（SSH 别名），路径 `/opt/dingding-platform`

### 工作模式
- 用户：需求提出者 + 最终决策者
- 我：分析、规划、协调（编码委托给 Copilot CLI）
- 流程：需求 → 设计 → `copilot -p` 开发 → 测试 → PR → 等用户合并

---

## 📋 项目状态（最后更新：2026-03-11）

### Platform（dingding-platform）
- **已知问题**：磁盘使用率 95%（54GB/59GB），需清理 Docker 镜像和卷
- **容器异常**：gaccode 容器不健康；tddatasvr 持续重启
- **安全待办**：防火墙未启用，Docker 端口暴露 0.0.0.0

### Agents（dingding-agents）
- 已有 Agent 数量：14 个
- 进行中需求：App 掘金监控机器人（Fast-Follower Bot），P1，status: new

### 基础设施
- Feishu 频道：✅ 正常（cli_a93a959ece799bef）
- investment-advisor：✅ 已修复（2026-03-11）
- ops-health 报告：`~/workroot/dingding-platform/.agents/skills/ops-health/reports/`

---

## 📊 任务日志

### 2026-03-11
- ✅ 修复 Feishu 插件加载失败（devDependencies workspace 引用问题）
- ✅ 修复 investment-advisor workspace 路径配置
- ✅ 完成平台健康巡检（磁盘 95%，需清理）
- ✅ 确认 App 掘金监控机器人需求：首版聚焦 App Store，Markdown 输出，子 Agent 分段处理
- ✅ 完善盯钉喵开发助理 SOP（session startup、角色定义、Copilot 调用方式）

---

> 长期记忆在 MEMORY.md。日常记录在 memory/YYYY-MM-DD.md。
