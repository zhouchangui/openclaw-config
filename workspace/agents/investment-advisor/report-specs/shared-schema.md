# shared-schema.md

## 目标

定义三类市场报告的共享输入/输出约定，避免每个报告各自发散。

适用报告：
- `morning`
- `closing`
- `news`

---

## 共享元数据字段

```json
{
  "reportId": "string",
  "reportType": "morning|closing|news",
  "title": "string",
  "summary": "string",
  "tradingDate": "YYYY-MM-DD",
  "generatedAt": "ISO datetime",
  "timezone": "Asia/Shanghai",
  "marketScope": "A-share|A-share+global",
  "status": "draft|partial|ready|published|failed",
  "fallbackLevel": "none|mild|strong",
  "sources": [
    {
      "name": "string",
      "status": "ok|partial|failed",
      "timestamp": "ISO datetime"
    }
  ]
}
```

---

## 共享内容层字段

```json
{
  "conclusion": {
    "text": "string",
    "tags": ["string"]
  },
  "summaryCards": [
    { "title": "string", "text": "string" }
  ],
  "risks": ["string"],
  "detailRows": [
    {
      "dimension": "string",
      "value": "string",
      "change": "string",
      "interpretation": "string"
    }
  ]
}
```

---

## 报告类型差异字段

### morning
- `globalMarkets`
- `todayWatch`
- `policySignals`
- `premarketBias`

### closing
- `metrics`
- `indexChart`
- `leadersChart`
- `laggardsChart`
- `technicalCharts`
- `structureAnalysis`
- `nextWatch`

### news
- `topNews`
- `impactMatrix`
- `macroSignals`
- `policySignals`
- `industrySignals`
- `noiseFilter`

---

## 状态与降级约定

- `draft`：仅草稿，未审查
- `partial`：部分数据缺失，但已生成可读报告
- `ready`：可发布
- `published`：已上传并已发送
- `failed`：生成失败

### fallbackLevel
- `none`：数据完整
- `mild`：局部字段缺失，但可继续
- `strong`：只能保底输出文本摘要

---

## 核心原则

1. 定时任务只能消费标准字段，不要直接拼正文。
2. 模板只能消费 schema 中定义的数据。
3. 缺失字段必须显式标记，不允许静默吞掉。
4. 所有报告都要支持“文本保底 + HTML 增强”双路径。
