# TOOLS.md - 盯钉喵开发助理的工具与导航

## 🚀 快速启动

### Platform（平台）

```bash
# 进入项目
cd ~/.openclaw/workspace/agents/dingding-assistant/projects/platform

# 启动完整环境
cd docker && docker compose -f docker-compose.dev.yml up -d
cd ../backend && npm run start:dev &
cd ../frontend && npm run dev &
cd ../runner-node && npm run dev &

# 停止环境
cd docker && docker compose -f docker-compose.dev.yml down
```

**常用端口**：
- 前端：http://localhost:5173
- 后端 API：http://localhost:3000
- Keycloak：http://localhost:8080
- PostgreSQL：localhost:5432

### Agents（智能体）

```bash
# 进入项目
cd ~/.openclaw/workspace/agents/dingding-assistant/projects/agents

# 查看现有 agents
ls -la agents/

# 进入某个 agent
cd agents/content-creator-miao

# 本地测试
npm run test

# 发布开发环境
ddm services:update . --env-file .env.dev
ddm publish . --env-file .env.dev

# 发布生产环境
ddm publish . --env-file .env.prod
```

**常用 Agent**：
- `content-creator-miao` — 内容创作
- `ai-digest-agent` — RSS 摘要
- `image-gen-miao` — 图片生成
- `wnl-agent-opencode` — 网络文摘

### Content（素材库）

```bash
cd ~/.openclaw/workspace/agents/dingding-assistant/projects/content

# 查看素材结构
ls -la "盯钉喵_自媒体素材库/"
```

---

## 🔧 开发工具链

### Git 工作流

```bash
# 查看当前分支
git branch -a

# 创建功能分支
git checkout -b feature/your-feature-name

# 提交代码
git add .
git commit -m "feat: your feature description"

# 推送到远程
git push origin feature/your-feature-name

# 创建 PR（通过 GitHub/GitLab 界面）
```

### 代码质量

```bash
npm run lint
npm run format
npm run test
npm run build
```

---

> 更新中...
