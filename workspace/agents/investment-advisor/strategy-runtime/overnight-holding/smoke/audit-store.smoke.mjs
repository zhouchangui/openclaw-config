import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = await mkdtemp(path.join(tmpdir(), 'overnight-audit-'));

const { createAuditStore } = await import(
  pathToFileURL(path.join(runtimeRoot, 'lib', 'audit-store.mjs')).href
);

try {
  const store = createAuditStore({ workspaceRoot: root });

  await store.recordSelectionAudit({
    tradingDate: '2026-03-11',
    marketContext: {
      mainThemeClarity: 78,
      tradable: true
    },
    candidatePool: [
      {
        symbol: '300750',
        name: '宁德时代',
        passedRules: true,
        rejectReason: null,
        rawData: { pct: 5.45 }
      },
      {
        symbol: '600519',
        name: '贵州茅台',
        passedRules: true,
        rejectReason: 'llm_rejected',
        rawData: { pct: -0.13 }
      }
    ],
    ruleEngineResult: {
      passedCandidates: ['300750', '600519'],
      blocked: false
    },
    llmDecisionJson: {
      action: 'buy',
      buyList: [{ symbol: '300750', weightPct: 20 }],
      rejectedCandidates: [{ symbol: '600519', reason: '弹性不足' }],
      principlesCited: ['强势延续优先'],
      riskFlags: ['高波动'],
      confidence: 'medium'
    },
    portfolioDecision: {
      initialCapital: 100000,
      availableCash: 100000,
      deployableToday: 50000,
      reservedCashFloor: 30000,
      actualDeployAmount: 20000
    },
    executionLog: [
      { type: 'buy_executed', symbol: '300750', auditFillPrice: 398.4 }
    ],
    positionSnapshots: {
      beforeMarket: [],
      afterSelection: [{ symbol: '300750', status: 'open' }]
    },
    userCommunications: [
      { type: 'operation_report', channel: 'feishu', delivered: true }
    ],
    dataLineage: {
      marketFile: 'inputs/market.json',
      candidatesFile: 'inputs/candidates.json',
      runtimeVersion: 'test'
    },
    exceptionsAndFallbacks: []
  });

  await store.recordControlAudit({
    tradingDate: '2026-03-11',
    action: 'resume-request',
    status: { enabled: true, resumeRequired: true },
    messageSummary: '请在飞书确认是否恢复策略',
    userCommunications: [
      { type: 'resume_request', channel: 'feishu', delivered: true }
    ]
  });

  await store.recordSellReviewAudit({
    tradingDate: '2026-03-12',
    checkpointAt: '09:35',
    marketContext: {
      source: 'daily-fallback',
      tradable: true
    },
    candidatePool: [],
    ruleEngineResult: {
      openPositions: ['300750']
    },
    llmDecisionJson: {
      action: 'sell_on_first_push',
      sellList: [{ symbol: '300750', reason: '强度不足单边趋势' }],
      rejectedCandidates: [],
      principlesCited: ['午前兑现优先'],
      riskFlags: [],
      confidence: 'medium'
    },
    portfolioDecision: {
      actualDeployAmount: 20000
    },
    executionLog: [
      { type: 'sell_review_decision', symbol: '300750', action: 'sell_on_first_push' }
    ],
    positionSnapshots: {
      beforeReview: [{ symbol: '300750', status: 'open' }],
      afterReview: [{ symbol: '300750', status: 'closed' }]
    },
    userCommunications: [
      { type: 'operation_report', channel: 'feishu', delivered: true }
    ],
    dataLineage: {
      snapshotsFile: 'inputs/snapshots.json',
      runtimeVersion: 'test'
    },
    exceptionsAndFallbacks: [
      { type: 'minute_data_missing', fallback: 'daily-fallback' }
    ]
  });

  const daily = await store.loadAuditDay('2026-03-11');
  assert.equal(daily.tradingDate, '2026-03-11');
  assert.equal(daily.candidatePool.length, 2);
  assert.equal(daily.executionLog.length, 2);
  assert.equal(daily.userCommunications.length, 2);
  assert.equal(daily.llmDecisionHistory.length, 1);

  const nextDay = await store.loadAuditDay('2026-03-12');
  assert.equal(nextDay.executionLog[0].type, 'sell_review_decision');
  assert.equal(nextDay.exceptionsAndFallbacks[0].fallback, 'daily-fallback');

  const dailyFile = JSON.parse(
    await readFile(path.join(root, 'data', 'overnight-holding', 'audit', '2026-03-11.json'), 'utf8')
  );
  assert.equal(dailyFile.auditVersion, 1);
  assert.ok(Array.isArray(dailyFile.reportExports));

  console.log('audit-store smoke ok');
} finally {
  await rm(root, { recursive: true, force: true });
}
