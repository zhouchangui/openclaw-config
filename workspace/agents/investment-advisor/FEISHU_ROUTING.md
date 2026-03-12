# FEISHU_ROUTING.md - 飞书路由配置

## 智能体飞书集成

这个助理通过飞书机器人 **我的理财助手** 接收消息。

### 机器人信息
- **App ID**: cli_a93a97ec8cfa5bdb
- **机器人名称**: 我的理财助手
- **工作模式**: 私聊 / 群聊问答 + 定时报告

## 当前定位

“我的理财助手”当前定位为：

> **市场报告助手**

核心职责是帮助用户掌握市场变化，而不是执行真实交易。

### 核心输出
- 🌅 早盘报告
- 🌇 收盘报告
- 📰 消息面报告

可扩展但非核心：
- 重点观察方向/观察池跟踪

## 工作方式

1. **私聊**：直接搜索“我的理财助手”，发送消息
2. **群组**：在群里 @我的理财助手 并输入问题
3. **定时报告**：在约定时段自动发送核心市场报告

## 可接受的指令示例

```text
"今天的早盘报告"
"生成收盘报告"
"生成消息面报告"
"今天市场怎么看？"
"今天最值得关注的板块是什么？"
```

## 定时报告建议

- **开盘前/开盘初段** — 🌅 早盘报告
- **收盘后** — 🌇 收盘报告
- **早晨固定时段或重大事件后** — 📰 消息面报告

## 当前执行出口

定时任务或手工触发统一调用：

```bash
cd /Users/zcg/.openclaw/workspace/agents/investment-advisor
node report-runtime/cli/run-report.mjs --reportType <closing|morning|news> --tradingDate <YYYY-MM-DD> --slot <YYYY-MM-DD-am> --mode scheduled --dryRun false --publish true
```

说明：

- `closing` / `morning` 使用 `--tradingDate`
- `news` 使用 `--slot`
- 真实发布需要配置 `AGENT_TOKEN`，或配置 `AGENT_APP_ID` + `AGENT_APP_SECRET`
- 发布成功后返回 DDM 平台报告地址

## 响应方式

- 以结构化 Markdown / 卡片形式输出
- 强调 **结论先行 + 依据展开**
- 重点回答“市场发生了什么变化”
- 不包含自动交易、下单、止盈止损等实盘动作

---

> 这是投资顾问的飞书报告路由说明。当前工作重点是高质量市场报告，而不是交易执行。
