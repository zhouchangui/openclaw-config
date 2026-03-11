# 🚀 开发工作流系统设计

**决定**：所有代码执行通过 Copilot CLI  
**时间**：2026-03-10 23:40 GMT+8

---

## 📋 完整工作流

```
1️⃣ 需求获取（从看板）
    ↓
2️⃣ 需求分析（systematic-debugging/analysis）
    ↓
3️⃣ 工作计划（writing-plans）
    ↓
4️⃣ 创建 Worktree（using-git-worktrees）
    ↓
5️⃣ Copilot 执行开发
    ├─ Copilot 读取计划
    ├─ Copilot 编写代码
    ├─ Copilot 运行单元测试
    └─ Copilot 提交 commit
    ↓
6️⃣ 创建 PR（requesting-code-review）
    ↓
7️⃣ Feishu 通知用户
    ↓
8️⃣ 等待用户 code review
    ↓
9️⃣ 合并分支 & 更新看板
```

---

## 🎯 工作流详细步骤

### 第 1-3 步：需求分析与计划生成（我负责）

```yaml
输入: 看板中的需求
过程:
  1. 读取需求信息（title, description, priority, workload）
  2. 调用 systematic-debugging/analysis 技能分析
  3. 调用 writing-plans 技能生成实现计划
输出: 
  - 分析文档
  - 详细的实现计划
```

### 第 4 步：创建开发环境（我负责）

```bash
# 使用 using-git-worktrees 技能
git worktree add ../feature-branch-workspace feature/需求-id
cd ../feature-branch-workspace
```

### 第 5 步：Copilot 执行开发（核心）

```bash
# 我调用 Copilot CLI 来编写代码
copilot run "
  根据以下计划进行开发：
  [实现计划内容]
  
  要求：
  1. 按计划逐步实现
  2. 添加单元测试
  3. 遵循项目代码规范
  4. 每个逻辑块单独 commit
  5. commit message 遵循 conventional commits
"
```

### 第 6-9 步：PR 流程与通知（我负责）

```
创建 PR
    ↓
生成 PR 描述（包括：需求背景、设计、测试方式）
    ↓
通过 Feishu 通知用户
    ↓
等待用户 review
    ↓
用户批准 → 合并分支
    ↓
更新看板状态为「完成」
    ↓
删除 worktree
```

---

## 📊 集成的 Skills

| 步骤 | Skill | 功能 |
|------|--------|------|
| 分析 | systematic-debugging | 理解需求和技术复杂度 |
| 计划 | writing-plans | 生成详细实现计划 |
| 环境 | using-git-worktrees | 创建隔离开发空间 |
| 开发 | 🤖 **Copilot CLI** | 编写代码、运行测试 |
| PR | requesting-code-review | 创建 PR 并请求 review |
| 通知 | message/feishu | 发送 Feishu 通知 |

---

## 🔧 Copilot CLI 集成

### 如何调用 Copilot

```bash
# 基础命令
copilot [options] [command]

# 代码生成
copilot generate "description"

# 代码修复
copilot fix "问题描述"

# 代码解释
copilot explain "代码片段"

# 运行脚本
copilot run "脚本内容"
```

### 我使用 Copilot 的方式

```bash
# 我会这样调用 exec 工具，然后 Copilot 执行
exec(command="
  copilot run '
    任务描述
    [计划内容]
    [要求]
  '
")
```

---

## 📝 工作流生命周期

### 状态转换

```
需求看板
  ├─ 🆕 New
  ├─ 🔍 In Analysis (我: analysis 技能)
  ├─ 📋 Analyzed (我: writing-plans 技能)
  ├─ 🌳 Worktree Created (我: using-git-worktrees)
  ├─ 🤖 In Development (Copilot 执行)
  ├─ 📤 PR Created (我: 创建 PR)
  ├─ 👀 Code Review (你: review)
  ├─ ✅ Approved (你: 批准)
  ├─ 🔀 Merged (自动合并)
  └─ ✨ Completed
```

### 看板更新

在每个关键节点，我会更新看板中对应需求的状态。

---

## 🛠️ 开发任务的标准流程

### 快速检查清单

参见上述详细工作流步骤。

**核心清单**：
- [ ] ✅ 从看板读取需求
- [ ] ✅ 调用 analysis 分析
- [ ] ✅ 调用 writing-plans 生成计划
- [ ] ✅ 调用 using-git-worktrees 创建环境
- [ ] ✅ 调用 Copilot 执行开发
- [ ] ✅ 收集 Copilot 的输出
- [ ] ✅ 验证代码（运行测试）
- [ ] ✅ 创建 PR
- [ ] ✅ 通过 Feishu 通知你
- [ ] 🔀 合并分支
- [ ] 📊 更新看板
- [ ] 🗑️ 清理 worktree

---

## 📬 Feishu 通知内容

当 PR 创建时，我会发送：

```
🚀 开发任务完成！

📋 需求：用户认证系统
🔗 PR：[PR 链接]
📊 状态：等待 Code Review

📝 变更摘要：
- 添加认证 API 端点
- 实现 JWT token 生成
- 添加单元测试覆盖率 85%

🧪 E2E 验证步骤：
1. 启动开发服务器：npm run dev
2. 测试登录流程：[具体步骤]
3. 查看覆盖率报告：npm run test:coverage

⏰ 等待你的 review...
```

---

## 🚀 立即可以开始

现在系统已经准备好了。当你：

```
"从看板拿一个需求，开始开发"
```

我会：
1. ✅ 从看板读取需求
2. ✅ 分析和计划
3. ✅ 创建 worktree
4. ✅ 调用 Copilot 开发
5. ✅ 创建 PR
6. ✅ 发送 Feishu 通知
7. ✅ 等待你的 review

---

## 💾 相关文件

```
dingding-assistant/
├── requirements.base              # 需求看板
├── requirements/                  # 需求文件
├── WORKFLOW_GUIDE.md              # 需求工作流
├── DEVELOPMENT_WORKFLOW.md        # ← 本文件
└── development/                   # 开发相关文件
    ├── plans/                     # 实现计划
    ├── worktrees/                 # 临时 worktree
    └── prs/                       # PR 记录
```

---

## ✅ 系统准备完成

所有必要的集成都已就位：
- ✅ Obsidian 需求看板
- ✅ Brainstorm 需求分析
- ✅ Writing Plans 工作计划
- ✅ Git Worktree 隔离环境
- ✅ **Copilot CLI 代码执行**
- ✅ Code Review 工作流
- ✅ Feishu 通知系统

---

## 🎯 下一步

**准备好了吗？** 

告诉我：
```
"从看板拿一个 P1 的功能开始开发"
```

我会立即启动整个工作流！👍

---

_系统版本：1.0_  
_创建时间：2026-03-10 23:40 GMT+8_
