import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

import { createAuditStore } from './audit-store.mjs';

function inRange(value, fromDate, toDate) {
  if (fromDate && value < fromDate) return false;
  if (toDate && value > toDate) return false;
  return true;
}

async function loadAuditRange(store, { tradingDate, fromDate, toDate }) {
  if (tradingDate) {
    return [await store.loadAuditDay(tradingDate)];
  }

  const days = await store.listAuditDays();
  const selected = days.filter((item) => inRange(item, fromDate, toDate));
  return Promise.all(selected.map((item) => store.loadAuditDay(item)));
}

function sumByExecutionLog(auditDays, key) {
  return auditDays.flatMap((day) => day.executionLog).reduce((sum, item) => sum + Number(item[key] || 0), 0);
}

function countByExecutionType(auditDays, type) {
  return auditDays.flatMap((day) => day.executionLog).filter((item) => item.type === type).length;
}

function countRiskFlag(auditDays, flag) {
  return auditDays.flatMap((day) => day.llmDecisionHistory).filter((item) => (item.riskFlags || []).includes(flag)).length;
}

function countCommunications(auditDays) {
  return auditDays.flatMap((day) => day.userCommunications).length;
}

function averageDeploy(auditDays) {
  const values = auditDays.flatMap((day) => day.portfolioDecisionHistory).map((item) => Number(item.actualDeployAmount || 0));
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, item) => sum + item, 0) / values.length);
}

function buildDailyMarkdown(day) {
  const llm = day.llmDecisionHistory.at(-1) || {};
  const lines = [
    `# 隔日持股审计日报 ${day.tradingDate}`,
    '',
    '## 市场环境',
    `- 可交易：${day.marketContext?.tradable === false ? '否' : '是'}`,
    `- 停止原因：${day.marketContext?.stopReason || '无'}`,
    '',
    '## 候选池'
  ];

  for (const item of day.candidatePool) {
    lines.push(`- ${item.symbol} ${item.name} / passed=${item.passedRules !== false} / reject=${item.rejectReason || 'none'}`);
  }

  lines.push('', '## LLM 最终决策');
  lines.push(`- action: ${llm.action || 'unknown'}`);
  lines.push(`- confidence: ${llm.confidence || 'unknown'}`);

  for (const item of llm.buyList || []) {
    lines.push(`- 买入：${item.symbol} / weight=${item.weightPct || item.weight || '?'}%`);
  }
  for (const item of llm.rejectedCandidates || []) {
    lines.push(`- 放弃：${item.symbol} / reason=${item.reason}`);
  }

  lines.push('', '## 执行记录');
  for (const item of day.executionLog) {
    lines.push(`- ${item.type}${item.symbol ? ` / ${item.symbol}` : ''}${item.action ? ` / ${item.action}` : ''}`);
  }

  lines.push('', '## 用户沟通');
  for (const item of day.userCommunications) {
    lines.push(`- ${item.type} / delivered=${item.delivered !== false}`);
  }

  return `${lines.join('\n')}\n`;
}

function buildWeeklyMarkdown(auditDays) {
  const lines = [
    '# 隔日持股审计周报',
    '',
    `- 覆盖天数：${auditDays.length}`,
    `- 执行次数：${auditDays.reduce((sum, day) => sum + day.executionLog.length, 0)}`,
    `- 买入次数：${countByExecutionType(auditDays, 'buy_executed')}`,
    `- 卖出次数：${countByExecutionType(auditDays, 'sell_executed')}`,
    `- 空仓/不买次数：${countByExecutionType(auditDays, 'no_buy')}`,
    `- 净收益：${sumByExecutionLog(auditDays, 'netPnl')}`,
    `- 用户沟通次数：${countCommunications(auditDays)}`,
    '',
    '## 空仓与停止原因'
  ];

  for (const day of auditDays) {
    const reasons = day.executionLog.filter((item) => item.type === 'no_buy').map((item) => item.reason || 'unknown');
    const stopReason = day.marketContext?.stopReason;
    if (reasons.length === 0 && !stopReason) continue;
    lines.push(`- ${day.tradingDate}: ${[...reasons, stopReason].filter(Boolean).join(' / ')}`);
  }

  lines.push('', '## LLM 决策风格');
  lines.push(`- 逆势试错次数：${countRiskFlag(auditDays, 'counter_trend_probe')}`);

  return `${lines.join('\n')}\n`;
}

function buildMonthlyMarkdown(auditDays) {
  const netPnl = sumByExecutionLog(auditDays, 'netPnl');
  const grossPnl = sumByExecutionLog(auditDays, 'grossPnl');
  const buyCount = countByExecutionType(auditDays, 'buy_executed');
  const sellCount = countByExecutionType(auditDays, 'sell_executed');
  const winCount = auditDays
    .flatMap((day) => day.executionLog)
    .filter((item) => item.type === 'sell_executed' && Number(item.netPnl || 0) > 0)
    .length;

  const lines = [
    '# 隔日持股审计月报',
    '',
    `- 累计毛收益：${grossPnl}`,
    `- 累计净收益：${netPnl}`,
    `- 买入次数：${buyCount}`,
    `- 卖出次数：${sellCount}`,
    `- 胜率：${sellCount === 0 ? 0 : Math.round((winCount / sellCount) * 100)}%`,
    `- 仓位利用率：${averageDeploy(auditDays)}`,
    '',
    '## 主要失误归因'
  ];

  const fallbackCount = auditDays.flatMap((day) => day.exceptionsAndFallbacks).length;
  lines.push(`- fallback/异常次数：${fallbackCount}`);
  lines.push(`- 用户未确认次数：${countCommunications(auditDays.filter((day) => day.userCommunications.some((item) => item.type === 'resume_request')))} `);

  return `${lines.join('\n')}\n`;
}

function buildAnomalyMarkdown(auditDays) {
  const anomalies = [];
  for (const day of auditDays) {
    for (const item of day.exceptionsAndFallbacks) {
      anomalies.push(`- ${day.tradingDate}: ${item.type}${item.fallback ? ` / fallback=${item.fallback}` : ''}`);
    }
    for (const item of day.llmDecisionHistory) {
      for (const risk of item.riskFlags || []) {
        if (risk === 'counter_trend_probe') {
          anomalies.push(`- ${day.tradingDate}: counter_trend_probe`);
        }
      }
    }
  }

  return `# 隔日持股异常报告\n\n${anomalies.join('\n') || '- 无异常'}\n`;
}

function resolveReportPaths(workspaceRoot, reportType, suffix) {
  const fileKey = `${suffix}.${reportType}.md`;
  return path.join(workspaceRoot, 'reports', 'overnight-holding', 'audit', fileKey);
}

export async function buildAuditReport({
  workspaceRoot,
  reportType,
  tradingDate,
  fromDate,
  toDate
}) {
  const store = createAuditStore({ workspaceRoot });
  const auditDays = await loadAuditRange(store, { tradingDate, fromDate, toDate });

  if (auditDays.length === 0) {
    return {
      ok: false,
      reportType,
      messageSummary: '未找到可用审计档案。'
    };
  }

  let markdown;
  let summaryKey;

  if (reportType === 'daily-report' || reportType === 'report') {
    markdown = buildDailyMarkdown(auditDays[0]);
    summaryKey = auditDays[0].tradingDate;
  } else if (reportType === 'weekly-report') {
    markdown = buildWeeklyMarkdown(auditDays);
    summaryKey = `${fromDate || auditDays[0].tradingDate}_to_${toDate || auditDays.at(-1).tradingDate}`;
  } else if (reportType === 'monthly-report') {
    markdown = buildMonthlyMarkdown(auditDays);
    summaryKey = `${fromDate || auditDays[0].tradingDate}_to_${toDate || auditDays.at(-1).tradingDate}`;
  } else if (reportType === 'anomaly-report') {
    markdown = buildAnomalyMarkdown(auditDays);
    summaryKey = `${fromDate || auditDays[0].tradingDate}_to_${toDate || auditDays.at(-1).tradingDate}`;
  } else {
    throw new Error(`Unsupported audit report type: ${reportType}`);
  }

  const outputPath = resolveReportPaths(workspaceRoot, reportType, summaryKey);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, 'utf8');

  const messageSummary = `隔日持股 ${reportType} 已生成：${summaryKey}`;

  if (reportType === 'daily-report' || reportType === 'report') {
    await store.appendReportExport(auditDays[0].tradingDate, {
      reportType,
      outputPath,
      summaryKey
    });
  }

  return {
    ok: true,
    reportType,
    markdown,
    outputPath,
    messageSummary
  };
}
