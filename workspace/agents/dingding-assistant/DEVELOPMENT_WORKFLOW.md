# 🚀 开发工作流

**决定**：所有代码执行通过 `copilot` CLI（非交互模式）  
**更新时间**：2026-03-11

---

## 完整工作流

```
1️⃣ 读取需求（requirements/*.md 看板）
    ↓
2️⃣ 需求分析（systematic-debugging skill）
    ↓
3️⃣ 写实现计划（writing-plans skill）
    ↓
4️⃣ 创建 Worktree（using-git-worktrees skill）
    ↓
5️⃣ 调用 Copilot 执行编码
    ↓
6️⃣ 验证测试结果
    ↓
7️⃣ 创建 PR + Feishu 通知
    ↓
8️⃣ 【⛔ 等待用户 review + 确认合并】
    ↓
9️⃣ 合并分支 + 更新看板 + 清理 worktree
```

---

## 详细步骤

### 第 1 步：读取需求

看板是 `requirements/` 目录下的 `.md` 文件，每个文件有 YAML frontmatter。

**读取 P1 待开发需求：**
```bash
# 找出 status=new 且 priority=P1 的需求文件
grep -rl 'priority: P1' requirements/ | xargs grep -l 'status: new'
```

**更新需求状态：**
```bash
# 将状态改为 in-analysis
sed -i '' 's/^status: .*/status: in-analysis/' requirements/<需求文件名>.md
```

状态流转：`new` → `in-analysis` → `in-development` → `pr-created` → `completed`

### 第 2-3 步：分析与计划（我负责）

1. 调用 `systematic-debugging` skill 分析技术复杂度和风险
2. 调用 `writing-plans` skill 生成实现计划
3. 计划存入 `plans/<需求ID>-plan.md`（创建目录 `plans/` 如果不存在）

**计划模板：**
```markdown
# 实现计划：<需求标题>

## 目标
<一句话描述要做什么>

## 涉及文件/模块
- `backend/src/xxx/` — 新增 API
- `frontend/src/components/` — 新增组件

## 实现步骤
1. <步骤一>
2. <步骤二>
...

## 测试要求
- 单元测试覆盖 xxx 功能
- E2E 验证步骤：...

## 风险
- <潜在风险>
```

### 第 4 步：创建开发环境

```bash
# 在平台项目根目录执行
cd ~/workroot/dingding-platform
git worktree add ../dingding-platform-<需求ID> feature/<需求ID>
```

### 第 5 步：调用 Copilot 执行编码

**核心命令：**
```bash
cd ~/workroot/dingding-platform-<需求ID>
PLAN=$(cat ~/.openclaw/workspace/agents/dingding-assistant/plans/<需求ID>-plan.md)

copilot -p "
根据以下实现计划进行开发：

$PLAN

规范要求：
1. 按计划逐步实现
2. 每个逻辑块单独 commit，格式：feat/fix/chore: <描述>
3. 新功能和 bug 修复必须有单元测试
4. 代码必须通过项目 ESLint（npm run lint）
5. 完成后运行 npm run test 并确认通过
" \
--allow-all \
--autopilot \
--share ./copilot-session-$(date +%Y%m%d%H%M%S).md \
-s
```

**关键 flag 说明：**
| Flag | 作用 |
|------|------|
| `-p` | 非交互模式，执行完退出（返回 exit code 0 表示成功） |
| `--allow-all` | 允许所有文件读写和命令执行，无需逐一确认 |
| `--autopilot` | 持续执行直到任务完成，不中途暂停询问 |
| `--share` | 将完整 session（每一步工具调用）保存为 `.md` 文件，便于审查 |
| `-s` | 静默模式：终端只输出最终回复，详细记录在 `--share` 文件中 |

> ℹ️ 简单任务约 20-60s，复杂任务可能 5-15min，正常等待即可。

### 第 6 步：验证（我负责）

```bash
cd ~/workroot/dingding-platform-<需求ID>

# 查看 Copilot 的 session 记录
cat copilot-session-*.md | tail -100

# 验证测试通过
npm run test --if-present

# 验证 lint
npm run lint --if-present

# 查看实际变更
git --no-pager log origin/main..HEAD --oneline
git --no-pager diff origin/main --stat
```

**失败处理：**
- 测试失败 → 用 `copilot -p "修复以下测试失败: [错误信息]" --allow-all --autopilot` 再次执行
- lint 错误 → 用 `copilot -p "修复以下 lint 错误: [错误信息]" --allow-all` 修复
- 超过 2 次仍失败 → 暂停，通过 Feishu 通知用户并附上错误详情，等待指示

### 第 7 步：创建 PR + 通知

```bash
# 推送分支
cd ~/workroot/dingding-platform-<需求ID>
git push origin feature/<需求ID>

# 创建 PR（使用 requesting-code-review skill）
gh pr create \
  --title "feat: <需求标题>" \
  --body "$(cat <<'EOF'
## 需求背景
<从需求文件中提取>

## 实现方案
<从计划文件中提取>

## 变更清单
<git diff --stat 结果>

## 测试方式
<验证步骤>
EOF
)" \
  --base main
```

**Feishu 通知内容：**
```
🚀 开发完成，等待 Code Review

📋 需求：<需求标题>
🔗 PR：<PR 链接>

📝 变更摘要：
- <改动 1>
- <改动 2>

🧪 验证步骤：
1. <步骤 1>
2. <步骤 2>

回复"合并"即可执行合并。
```

更新需求状态：
```bash
sed -i '' 's/^status: .*/status: pr-created/' requirements/<需求文件名>.md
```

### 第 8 步：【等待用户确认】

⛔ **停止。等待用户明确回复"合并"或"批准"后才能继续。**

不得自动合并。不得催促。

### 第 9 步：合并 + 清理

```bash
# 合并 PR
gh pr merge <PR编号> --squash --delete-branch

# 删除 worktree
cd ~/workroot/dingding-platform
git worktree remove ../dingding-platform-<需求ID>

# 更新需求状态
sed -i '' 's/^status: .*/status: completed/' requirements/<需求文件名>.md
```

完成后更新今日 `memory/YYYY-MM-DD.md`。

---

## 集成 Skills 一览

| 步骤 | Skill | 用途 |
|------|-------|------|
| 分析 | `systematic-debugging` | 理解需求复杂度和风险 |
| 计划 | `writing-plans` | 生成结构化实现计划 |
| 环境 | `using-git-worktrees` | 创建隔离开发空间 |
| 编码 | `copilot -p` CLI | 编写代码、运行测试、提交 |
| PR | `requesting-code-review` | 创建 PR 并请求 review |
| 通知 | Feishu channel | 发送进度通知 |

---

## 状态机

```
requirements/<需求>.md frontmatter:
  new → in-analysis → in-development → pr-created → completed
                                                 ↓ (rejected)
                                             in-development (重开)
```

---

## 相关文件

```
dingding-assistant/
├── requirements/          # 需求看板（*.md 文件，YAML frontmatter）
├── requirements.base      # Obsidian 看板视图配置（不要手动编辑）
├── plans/                 # 实现计划（每个需求一个文件）
└── development-lessons.md # 开发经验积累
```

```
