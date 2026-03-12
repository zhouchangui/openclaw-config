# HTML 报告写作规范（WNL 智能体版）

## 目标
该模板用于「幸运万年历-择日助手」的日报发布，需体现智能体的人设与边界：
- 多流派解读（黄历/神煞/建除/八字）
- 引经据典 + 白话解释
- 结论务实，不夸张承诺
- 保留“仅供传统文化参考”的边界提示

## 目录结构（必须）

```
report-output/
  index.html
  styles.css
  report.js
  assets/
  vendor/
    chart.umd.min.js
```

## 强制约束
- 禁止在 `index.html` 内联 CSS 或 JS。
- 禁止使用外部 CDN，第三方库仅允许本地 `vendor/`。
- 若 `report.js` 使用 `__REPORT_DATA__`，占位符必须且仅包含一次。
- 所有动态内容必须来自 `reportData`，不要写死业务数据。
- 模板风格可独立于平台设计，但要保持移动端可读性。
- 如使用 `{{ ... }}` 占位符，发布时必须全部成功渲染；任何未填值会导致发布失败。

## 占位符渲染规则（新增）
- 支持路径占位符：`{{ meta.title }}`、`{{ day.yi }}`（从 `reportData` 取值）。
- 支持字面量键占位符：`{{ 这里填写宜忌信息 }}`（从 `templateVars` 取值）。
- 空值（`null/undefined/""`）视为未填。
- 推荐把“必须由 LLM 输出”的文字都写成 `{{ ... }}`，借助发布前校验防止漏填。

## 数据结构建议
推荐按以下分层组织 `reportData`：
- `meta`: `reportId/title/generatedAt/timezone/agentName/mission/boundary`
- `day`: `date/weekday/lunar/ganzhiDay/jieqi/yi/ji/chong/sha`
- `interpretation`: `subtitle/tone/headline/subline/yiItems/jiItems`
- `analysis`: `huangli/shensha/jianchu/bazi`
- `scenarios`: `tags/tip`
- `quotes`: `[{source, quote, explanation}]`

## 内容表达要求
- 先给可执行建议，再解释“为什么”。
- 典籍引用后必须跟白话解释。
- 避免“保证好运/绝对化结论/恐吓式表述”。
- 结尾固定放置边界说明：`以上内容基于中国传统择日文化，仅供参考。`

## 视觉建议（当前模板方向）
- 主色：红金暖色（喜庆风格），辅色用于“宜/忌”区分。
- 信息层次：今日总势 > 宜忌动作 > 多流派解读 > 典籍与原文。
- 保持桌面与移动端两套断点展示一致性。
