# 🚀 平台运维工作流系统

**位置**：平台项目本地（不复制到系统目录）  
**技能来源**：
- `/Users/zcg/workroot/dingding-platform/.agents/skills/ops-health/SKILL.md`
- `/Users/zcg/workroot/dingding-platform/.agents/skills/ops-update/SKILL.md`

---

## 📋 系统概览

两个核心运维技能的工作流化管理：

| 工作流 | 触发词 | 功能 | 输出 |
|--------|--------|------|------|
| **ops-health** | 巡检、体检、检查服务器 | 全方位健康检查 + 安全审计 | 结构化报告（.md 文件） |
| **ops-update** | 发版、部署、上线、更新 | 版本更新 + 部署执行 | 变更日志 + 部署验证 |

---

## 🏥 工作流 1️⃣：ops-health（平台健康巡检）

### 快速触发

当你需要进行平台检查时，直接告诉我：

```
"给平台做一个健康巡检"
或
"执行平台体检"
或
"检查平台服务器状态"
```

### 工作流执行步骤

#### 📌 阶段 0：初始化 + 加载经验

1. **创建本次巡检的临时状态文件**
   ```
   /tmp/ops_health_YYYYMMDD_HHMMSS.md
   ```
   - 初始化任务清单（5 个检查项）
   - 标记每个子任务为 `[ ]`（未完成）

2. **读取历史教训**（如果存在）
   ```
   .agents/skills/ops-health/health-lessons.md
   ```
   - 加载过往巡检的特殊检查项
   - 应用已知的问题和解决方案

#### 🔍 阶段 1：分段采集（5 个子任务）

**子任务 A：主机状态（1.1 Host Status）**
- CPU 负载、内存使用、磁盘总览
- 关键目录体量
- TOP 大文件（>100MB）
- 📤 结果追加到任务文件

**子任务 B：项目运行状态（1.2 App/Service Status）**
- Docker 容器状态
- 近期错误日志（20000 行扫描，只输出报错行）
- 📤 结果追加到任务文件

**子任务 B.5：Docker 全局统计（1.2.5 Docker System Stats）**
- 资源摘要（镜像、卷、悬空资源）
- 所有容器清单（含停止状态）
- 镜像清单（Top 20）
- 📤 结果追加到任务文件

**子任务 C：数据库状态（1.3 Database Status）**
- 容器存活性
- 活跃连接数
- 各数据库体积
- 锁等待检测
- 备份文件清单
- 📤 结果追加到任务文件

**子任务 D：服务器安全状态（1.4 Security Status）**
- 监听端口全览
- 防火墙状态
- 近期登录记录
- SSH 暴破统计（24h）
- **SSL 证书到期时间（精确剩余天数）**
- 特权账户检查
- .env.prod 文件权限
- 📤 结果追加到任务文件

#### 📊 阶段 2：隐患研判

根据采集结果对照评级标准：

| 检查项 | 🔴 高危 | 🟡 预警 | 🟢 正常 |
|--------|--------|--------|--------|
| 磁盘使用率 | > 90% | 80-90% | < 80% |
| 容器状态 | 有 Exited/Restarting | — | 全部 Up |
| DB 连接数 | > max 80% | 60-80% | < 60% |
| DB 锁等待 | 存在死锁 | 有等待 | 无 |
| SSL 证书 | ≤ 7 天到期 | ≤ 30 天 | > 30 天 |
| 敏感端口暴露 | 0.0.0.0 监听 | — | 仅内网/127.0.0.1 |
| SSH 暴破 | > 50 次/24h | 10-50 次 | < 10 次 |
| .env 权限 | 644（全员可读） | — | 600 或 640 |

#### 📄 阶段 3：生成报告（**必须落盘**）

读取任务文件，汇总分析后，生成结构化报告：

```markdown
# 📊 平台运维巡检报告 (JXHS 服务器)
**巡检时间：** YYYY-MM-DD HH:MM
**综合考评：** [🟢 健康 / 🟡 发出警告 / 🔴 存在严重风险]
**原始数据文件：** /tmp/ops_health_TIMESTAMP.md

## 1. 🖥️ 服务器基础设施
- **CPU负载：** ...
- **内存状态：** ...
- **磁盘总览：** ... 状态评级
- **关键目录体量：** ...
- **TOP 大文件：** ...

## 2. 🚢 业务容器与服务状态
- **群集存活：** X/X 服务在线
- **日志健康度：** ...

## 3. 🐳 Docker 实例资源统计
- **资源摘要：** ...
- **悬空资源：** ...
- **已停止容器：** ...

## 4. 🗄️ 数据库健康
- **实例状态：** ...
- **活跃连接数：** ...
- **各库体积：** ...
- **锁等待：** ...
- **备份文件：** ...

## 5. 🛡️ 系统安全
- **危险端口暴露：** ...
- **防火墙：** ...
- **SSH 暴破：** ...
- **SSL 证书：** ...
- **账户安全：** ...
- **.env 权限：** ...

## 6. 💡 运维闭环建议
1. [紧急: ...]
2. [建议: ...]
```

**💾 报告必须落盘到：**
```
.agents/skills/ops-health/reports/health_report_YYYYMMDD_HHMMSS.md
```

#### 🧠 阶段 4：自我总结

若发现巡检不足之处或用户补充了新检查项，归纳到：
```
.agents/skills/ops-health/health-lessons.md
```

记录格式：
```markdown
### [YYYY-MM-DD] 记录：<事件描述>
- **事发现场：** 漏检了什么 / 用户补充了什么？
- **根本原因：** 为什么原有步骤不足？
- **进化规则：** 下次巡检时额外增加的检查项。
```

### 快速执行清单

参见上述详细工作流步骤（阶段 0-4）。

---

## 🚀 工作流 2️⃣：ops-update（平台版本更新）

### 快速触发

当你想部署新版本时，直接告诉我：

```
"发版本"
或
"部署平台更新"
或
"上线最新代码"
或
"执行平台更新"
```

### 工作流执行步骤

#### 📌 阶段 0：温故知新

1. **读取运维经验**（如果存在）
   ```
   .agents/skills/ops-update/ops-lessons.md
   ```
   - 加载过往部署的报错记录
   - 应用已知的网络/配置约束

#### 📝 阶段 1：分析变更

获取 git 信息，确定本次更新的范围：

```bash
git --no-pager tag --sort=-version:refname | head -5
# 找到上次发布标签

git --no-pager log <last-tag>..HEAD --oneline --no-merges
# 列出新增提交

git --no-pager diff <last-tag>..HEAD --name-only \
  | grep -E '^(backend|frontend|runner-node|docker)/' \
  | cut -d/ -f1 | sort -u
# 分析涉及的模块

git --no-pager diff <last-tag>..HEAD -- backend/prisma/schema.prisma
# 检测是否有 DB Schema 变更（🚨 关键！）
```

**提交分类**：
- `feat:` → ✨ 新功能
- `fix:` → 🐛 问题修复
- `chore:` / `refactor:` → 🔧 工程优化
- `docs:` → 📝 文档更新

#### 📋 阶段 2：更新 CHANGELOG.md

版本号自动取 main 分支最新提交的短 hash（7 位）：

```bash
git --no-pager rev-parse --short=7 main
```

在 CHANGELOG.md 顶部追加：

```markdown
## [<commit-hash>] - YYYY-MM-DD

### ✨ 新功能
- ...

### 🐛 问题修复
- ...

### 🔧 工程优化
- ...
```

#### 🎯 阶段 3：制定部署方案

根据变更模块生成执行清单：

```
📋 部署方案 <commit-hash>
═══════════════════════════════════
服务器：jxhs → /opt/dingding-platform
分支：main

变更模块：
  ✅ backend      → 命中服务端变更，触发统一 down/up --build
  ✅ frontend     → 随统一重建流程一并发布
  ⬜ runner-node  → 无变更

部署策略：
  ✅ 检测到服务端变更（backend / schema）
  ✅ 使用完整 Compose 生命周期：down → up -d --build

附加步骤：
  ⚠️  检测到 schema.prisma 变更 → 执行 prisma:push

执行命令预览：
  1. git pull origin main
  2. docker compose config -q
  3. docker compose exec -T postgres pg_dump... > db_backup.sql  ← (Schema 变更必须备份！)
  4. docker compose exec backend npm run prisma:push  ← (在旧容器中执行！)
  5. docker compose down
  6. docker compose up -d --build
  7. 健康检查（等待 30s）
═══════════════════════════════════
请回复"确认执行"以继续。
```

**⚠️ 必须等待用户明确回复"确认执行"后才能继续。**

#### 🔧 阶段 4：远程执行

连接到 jxhs 服务器，逐步执行：

```bash
ssh jxhs bash -s << 'EOF'
set -e
cd /opt/dingding-platform

echo "=== [1/6] 拉取最新代码 ==="
git pull origin main

cd /opt/dingding-platform/docker

echo "=== [2/6] 验证 Compose 配置 ==="
docker compose -p dingding -f docker-compose.prod.yml --env-file .env.prod config -q

echo "=== [3/6] 如有 Schema 变更，先在旧容器执行备份与 prisma:push ==="
# [备份命令]
# [prisma:push 命令]

echo "=== [4/6] 停止当前 Compose 项目 ==="
docker compose -p dingding -f docker-compose.prod.yml --env-file .env.prod down

echo "=== [5/6] 重新构建并启动服务 ==="
docker compose -p dingding -f docker-compose.prod.yml --env-file .env.prod up -d --build

echo "=== [6/6] 容器状态 ==="
sleep 8
docker compose -p dingding -f docker-compose.prod.yml --env-file .env.prod ps
EOF
```

**关键安全规则**：
- ✅ Schema 变更时**必须**先备份数据库（pg_dump）
- ✅ Schema 变更时**必须**在旧容器执行 `prisma:push`
- ✅ 只要命中服务端变更，统一执行完整 Compose 生命周期
- ✅ 任何步骤失败立即停止，不自动重试

#### ✅ 阶段 5：验证

检查容器状态，确认所有服务都启动成功：

```
✅ dingding-backend-prod    Up (healthy)
✅ dingding-frontend-prod   Up
✅ dingding-runner-node-prod Up (healthy)
```

#### 🧠 阶段 6：自我总结

若发生意外报错或被纠正，记录到：
```
.agents/skills/ops-update/ops-lessons.md
```

记录格式：
```markdown
### [YYYY-MM-DD] 记录：<事件或纠正点>
- **事发现场：** 做了什么导致报错 / 用户纠正了什么？
- **根本原因：** 为什么初始判断存在偏差？
- **进化规则：** 未来执行此类部署时，必须遵守的新规则。
```

### 快速执行清单

参见上述详细工作流步骤（阶段 0-6）。

---

## 🎯 关键决策与约束

### ops-health 的关键点

1. **分段采集架构**
   - 避免上下文爆炸
   - 每个子任务完成后立即写入临时文件
   - 最后父任务统一读取并汇总

2. **SSL 证书检查**
   - 自动探测域名（从 Nginx / .env.prod / hostname）
   - 计算精确剩余天数
   - 分级告警（≤7天 🔴、≤30天 🟡）

3. **报告必须落盘**
   - ⛔ 不能只输出在对话中
   - 必须写入 `reports/health_report_YYYYMMDD_HHMMSS.md`
   - 使用 `write_to_file` 工具确保持久化

### ops-update 的关键点

1. **版本号自动取 hash**
   - 无需询问用户确认版本号
   - 使用 main 分支最新提交的短 hash

2. **Schema 变更的最高警戒**
   - 检测到 `schema.prisma` 变更时，**强制**要求备份
   - 必须在旧容器中执行 `prisma:push`
   - 再执行 `docker compose down`

3. **完整 Compose 生命周期**
   - 只要命中服务端变更，统一 `down` → `up -d --build`
   - 不再拆成逐个服务的 `build` / `up --no-deps`

4. **必须等待用户确认**
   - 部署方案生成后，等待用户明确回复"确认执行"
   - 不自动执行

---

## 📁 文件结构

```
dingding-platform/.agents/skills/
├── ops-health/
│   ├── SKILL.md                    ← 技能定义（不复制）
│   ├── health-lessons.md           ← 历史教训（持久化）
│   └── reports/
│       ├── health_report_20260310_173800.md
│       ├── health_report_20260311_090000.md
│       └── ...
│
└── ops-update/
    ├── SKILL.md                    ← 技能定义（不复制）
    ├── ops-lessons.md              ← 历史教训（持久化）
    └── [CHANGELOG.md 变更追踪]
```

---

## 🚀 立即可以做的事

### 场景 1：进行平台健康巡检

```
"给平台做个健康巡检"
```

**我会**：
1. 初始化巡检任务
2. 执行 5 个采集子任务
3. 研判隐患
4. 生成报告并落盘
5. 通知你报告位置

### 场景 2：部署平台更新

```
"发版本，部署最新代码"
```

**我会**：
1. 分析 git 变更
2. 生成部署方案
3. 等待你的"确认执行"
4. 远程执行部署
5. 验证容器状态

---

## 💡 如何使用

### 当你需要时直接说

工作流是**响应式**的，不需要提前设置或配置。当你有需求时：

- 🏥 **平台检查**：`"巡检一下平台"`
- 🚀 **版本更新**：`"发新版本"`
- 🔍 **问题排查**：`"看看最近有什么问题"`
- 📊 **生成报告**：`"生成一份平台体检报告"`

### 我的职责

每次触发时，我会：
1. ✅ 加载历史经验（lessons.md）
2. ✅ 按标准流程执行
3. ✅ 在关键节点等待你的确认（如部署方案）
4. ✅ 生成结构化输出（报告、日志）
5. ✅ 总结新的经验教训

---

_工作流版本：1.0_  
_创建时间：2026-03-10 23:42 GMT+8_  
_维护位置：平台项目本地（不复制到系统目录）_
