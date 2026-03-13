import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await mkdtemp(path.join(tmpdir(), 'overnight-audit-report-'));

const { createAuditStore } = await import(
  pathToFileURL(path.join(runtimeRoot, 'lib', 'audit-store.mjs')).href
);
const { buildAuditReport } = await import(
  pathToFileURL(path.join(runtimeRoot, 'lib', 'audit-report.mjs')).href
);

try {
  const store = createAuditStore({ workspaceRoot: root });

  await store.recordSelectionAudit({
    tradingDate: '2026-03-10',
    marketContext: { tradable: false, stopReason: 'market_weak' },
    candidatePool: [],
    ruleEngineResult: { blocked: true },
    llmDecisionJson: {
      action: 'no_buy',
      buyList: [],
      rejectedCandidates: [],
      principlesCited: ['市场优先'],
      riskFlags: ['market_weak'],
      confidence: 'high'
    },
    portfolioDecision: { actualDeployAmount: 0 },
    executionLog: [{ type: 'no_buy', reason: 'market_weak' }],
    positionSnapshots: { beforeMarket: [], afterSelection: [] },
    userCommunications: [],
    dataLineage: { runtimeVersion: 'test' },
    exceptionsAndFallbacks: []
  });

  await store.recordSelectionAudit({
    tradingDate: '2026-03-11',
    marketContext: { tradable: true },
    candidatePool: [{ symbol: '300750', name: '宁德时代', passedRules: true, rawData: { pct: 5.45 } }],
    ruleEngineResult: { blocked: false, passedCandidates: ['300750'] },
    llmDecisionJson: {
      action: 'buy',
      buyList: [{ symbol: '300750', weightPct: 20 }],
      rejectedCandidates: [],
      principlesCited: ['强势延续优先'],
      riskFlags: [],
      confidence: 'medium'
    },
    portfolioDecision: { actualDeployAmount: 20000 },
    executionLog: [{ type: 'buy_executed', symbol: '300750', netPnl: 0 }],
    positionSnapshots: { beforeMarket: [], afterSelection: [{ symbol: '300750', status: 'open' }] },
    userCommunications: [{ type: 'operation_report', delivered: true }],
    dataLineage: { runtimeVersion: 'test' },
    exceptionsAndFallbacks: []
  });

  await store.recordSellReviewAudit({
    tradingDate: '2026-03-12',
    checkpointAt: '09:35',
    marketContext: { tradable: true },
    candidatePool: [],
    ruleEngineResult: { openPositions: ['300750'] },
    llmDecisionJson: {
      action: 'sell_on_first_push',
      sellList: [{ symbol: '300750', reason: '强度不足' }],
      rejectedCandidates: [],
      principlesCited: ['午前兑现优先'],
      riskFlags: ['counter_trend_probe'],
      confidence: 'medium'
    },
    portfolioDecision: { actualDeployAmount: 0 },
    executionLog: [{ type: 'sell_executed', symbol: '300750', grossPnl: 1000, netPnl: 920 }],
    positionSnapshots: { beforeReview: [{ symbol: '300750', status: 'open' }], afterReview: [{ symbol: '300750', status: 'closed' }] },
    userCommunications: [{ type: 'operation_report', delivered: true }],
    dataLineage: { runtimeVersion: 'test' },
    exceptionsAndFallbacks: [{ type: 'minute_data_missing', fallback: 'daily-fallback' }]
  });

  const daily = await buildAuditReport({
    workspaceRoot: root,
    reportType: 'daily-report',
    tradingDate: '2026-03-11'
  });
  assert.equal(daily.ok, true);
  assert.match(daily.messageSummary, /2026-03-11/);
  assert.match(daily.markdown, /宁德时代/);

  const weekly = await buildAuditReport({
    workspaceRoot: root,
    reportType: 'weekly-report',
    fromDate: '2026-03-10',
    toDate: '2026-03-12'
  });
  assert.match(weekly.markdown, /执行次数/);
  assert.match(weekly.markdown, /净收益/);

  const monthly = await buildAuditReport({
    workspaceRoot: root,
    reportType: 'monthly-report',
    fromDate: '2026-03-10',
    toDate: '2026-03-12'
  });
  assert.match(monthly.markdown, /仓位利用率/);

  const anomaly = await buildAuditReport({
    workspaceRoot: root,
    reportType: 'anomaly-report',
    fromDate: '2026-03-10',
    toDate: '2026-03-12'
  });
  assert.match(anomaly.markdown, /fallback/);
  assert.match(anomaly.markdown, /counter_trend_probe/);

  console.log('audit-report smoke ok');
} finally {
  await rm(root, { recursive: true, force: true });
}
