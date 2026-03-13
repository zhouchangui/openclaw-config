# TOOLS.md - 龙虾公众号管家工具速查

## 关键路径

```bash
~/.openclaw/workspace/agents/wechat-lobster/          工作区根目录
~/.openclaw/workspace/agents/wechat-lobster/skills/   技能目录
~/.openclaw/workspace/agents/wechat-lobster/config/   配置模板
~/.openclaw/workspace/agents/wechat-lobster/output/   封面等输出目录（按需生成）
```

## 常用命令

```bash
# 查看 agent
openclaw agents list --bindings

# 从 IDENTITY.md 同步身份
openclaw agents set-identity --workspace ~/.openclaw/workspace/agents/wechat-lobster --from-identity

# 生成文章初始化文件
python3 skills/article-writer/scripts/start_article.py

# 竞品搜索
node skills/content-planner/scripts/search_wechat.js "关键词" -n 10

# Markdown 转 HTML
node skills/markdown-to-html/scripts/main.ts <markdown-file>

# 发布编排（按 SKILL.md 选择脚本）
# 先阅读 skills/publish-orchestrator/SKILL.md 再执行
```

## 注意事项

- 发布前先检查 `.secrets/wechat-config.json` 是否存在。
- `WECHAT_WORKFLOW.md` 保留了从 EasyClaw 迁移来的完整周运营协议。
- `PROBLEMS.md` 收录了搜索、配图、发布、浏览器粘贴等常见问题。
