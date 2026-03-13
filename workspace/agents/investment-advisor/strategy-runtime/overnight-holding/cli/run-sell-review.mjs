import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseBoolean, parseCliArgs, printJson } from '../lib/io.mjs';
import { createAuditStore } from '../lib/audit-store.mjs';
import { applySellToState } from '../lib/portfolio.mjs';
import { createStateStore } from '../lib/state-store.mjs';
import { evaluateSellDecision } from '../lib/sell-decision.mjs';
import { validateSellReviewInput } from '../lib/schema-checks.mjs';

function resolveDefaultWorkspaceRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

function resolveRuntimeRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readOptionalJson(filePath) {
  return filePath ? readJson(filePath) : null;
}

async function writeText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

function buildReviewPaths(workspaceRoot, tradingDate) {
  return {
    dataPath: path.join(workspaceRoot, 'data', 'overnight-holding', `${tradingDate}.sell-review.json`),
    markdownPath: path.join(workspaceRoot, 'reports', 'overnight-holding', `${tradingDate}.sell-review.md`)
  };
}

function buildSummary({ tradingDate, decisions }) {
  const actionCounts = decisions.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1;
    return acc;
  }, {});

  return [
    `隔日持股 ${tradingDate} 卖出复盘`,
    `结论：本轮复盘共输出 ${decisions.length} 条动作建议。`,
    `动作分布：立即卖出 ${actionCounts.sell_now || 0} / 冲高兑现 ${actionCounts.sell_on_first_push || 0} / 延后复核 ${actionCounts.hold_and_recheck || 0}`
  ].join('\n');
}

function buildLlmDecisionJson(decisions) {
  if (decisions.length === 0) {
    return {
      action: 'no_action',
      sellList: [],
      rejectedCandidates: [],
      principlesCited: ['无持仓则不操作'],
      riskFlags: [],
      confidence: 'high',
      decisionMode: 'runtime_fallback'
    };
  }

  return {
    action: decisions.length === 1 ? decisions[0].action : 'mixed',
    sellList: decisions.map((item) => ({
      symbol: item.symbol,
      action: item.action,
      reason: item.why.join('；')
    })),
    rejectedCandidates: [],
    principlesCited: ['午前兑现优先'],
    riskFlags: decisions.some((item) => item.rawSource === 'daily-fallback') ? ['daily_fallback'] : [],
    confidence: 'medium',
    decisionMode: 'runtime_fallback'
  };
}

function buildMarkdown({ tradingDate, checkpointAt, decisions }) {
  const lines = [
    `# 隔日持股 ${tradingDate} 卖出复盘`,
    '',
    `- 检查点：${checkpointAt}`,
    `- 默认清仓截止：11:30`,
    '',
    '## 决策明细'
  ];

  for (const item of decisions) {
    lines.push(`- ${item.name}（${item.symbol}）：${item.action} / ${item.confidence}`);
    lines.push(`  - 原因：${item.why.join('；')}`);
  }

  return `${lines.join('\n')}\n`;
}

const args = parseCliArgs();
const input = {
  tradingDate: args.tradingDate,
  source: args.source,
  dryRun: parseBoolean(args.dryRun, false),
  checkpointAt: args.checkpointAt || '09:35',
  workspaceRoot: args.workspaceRoot || resolveDefaultWorkspaceRoot(),
  llmDecisionFile: args.llmDecisionFile,
  snapshotsFile: args.snapshotsFile || (parseBoolean(args.dryRun, false)
    ? path.join(resolveRuntimeRoot(), 'fixtures', 'sell-review.sample.json')
    : undefined)
};

const validation = validateSellReviewInput(input);
if (!validation.ok) {
  printJson({ ok: false, phase: 'sell-review', issues: validation.issues });
  process.exitCode = 1;
} else {
  const store = createStateStore({ workspaceRoot: input.workspaceRoot });
  const auditStore = createAuditStore({ workspaceRoot: input.workspaceRoot });
  const state = await store.loadState();
  const beforeReviewPositions = structuredClone(state.currentPositions);
  const openSymbols = new Set(
    state.currentPositions
      .filter((candidate) => candidate.status === 'open')
      .map((candidate) => candidate.symbol)
  );
  const snapshots = await readJson(input.snapshotsFile);
  const externalLlmDecision = await readOptionalJson(input.llmDecisionFile);
  const decisions = snapshots.checkpoints
    .filter((snapshot) => openSymbols.has(snapshot.symbol))
    .map((snapshot) => ({
      symbol: snapshot.symbol,
      name: snapshot.name,
      checkpointAt: input.checkpointAt,
      rawSource: snapshot.raw?.source || null,
      rawSnapshot: snapshot.raw || null,
      ...evaluateSellDecision({
        checkpointAt: input.checkpointAt,
        snapshot
      })
    }));
  const executionLog = [];

  for (const item of decisions) {
    const position = state.currentPositions.find((candidate) => candidate.symbol === item.symbol && candidate.status === 'open');
    if (!position) continue;
    if (item.action === 'hold_and_recheck') {
      position.nextCheckAt = item.nextCheckAt;
      position.lastReviewAction = item.action;
      executionLog.push({
        type: 'sell_review_decision',
        symbol: item.symbol,
        action: item.action
      });
      continue;
    }
    executionLog.push(applySellToState({
      state,
      tradingDate: input.tradingDate,
      position,
      decision: item,
      auditFillPrice: item.rawSnapshot?.close0935 || item.rawSnapshot?.close || null
    }));
  }

  state.sellReviewJournal.push({
    tradingDate: input.tradingDate,
    checkpointAt: input.checkpointAt,
    decisions
  });
  await store.saveState(state);

  for (const decision of decisions) {
    await store.appendJournalEvent(input.tradingDate, 'sell-review', {
      type: 'sell_review_snapshot',
      checkpointAt: input.checkpointAt,
      symbol: decision.symbol,
      action: decision.action
    });
  }

  const { dataPath, markdownPath } = buildReviewPaths(input.workspaceRoot, input.tradingDate);
  const messageSummary = decisions.length === 0
    ? [
      `隔日持股 ${input.tradingDate} 卖出复盘`,
      '结论：当前没有需要处理的虚拟持仓。',
      '本次仅完成状态巡检，未生成新的卖出动作。'
    ].join('\n')
    : buildSummary({
      tradingDate: input.tradingDate,
      decisions
    });
  const payload = {
    ok: true,
    phase: 'sell-review',
    tradingDate: input.tradingDate,
    source: input.source,
    checkpointAt: input.checkpointAt,
    decisions,
    llmDecisionJson: externalLlmDecision || buildLlmDecisionJson(decisions),
    executionLog,
    dataPath,
    markdownPath,
    messageSummary,
    dataSourceMode: input.dryRun ? 'fixtures' : 'external-files'
  };

  await writeText(dataPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeText(markdownPath, buildMarkdown({
    tradingDate: input.tradingDate,
    checkpointAt: input.checkpointAt,
    decisions
  }));

  await auditStore.recordSellReviewAudit({
    tradingDate: input.tradingDate,
    checkpointAt: input.checkpointAt,
    marketContext: {
      source: input.snapshotsFile,
      tradable: true
    },
    candidatePool: snapshots.checkpoints.map((snapshot) => ({
      symbol: snapshot.symbol,
      name: snapshot.name,
      rawData: snapshot.raw || null,
      passedRules: openSymbols.has(snapshot.symbol),
      rejectReason: openSymbols.has(snapshot.symbol) ? null : 'not_in_open_positions'
    })),
    ruleEngineResult: {
      openPositions: Array.from(openSymbols),
      reviewedSymbols: decisions.map((item) => item.symbol)
    },
    llmDecisionJson: payload.llmDecisionJson,
    portfolioDecision: {
      actualDeployAmount: 0,
      checkpointAt: input.checkpointAt
    },
    executionLog,
    positionSnapshots: {
      beforeReview: beforeReviewPositions,
      afterReview: state.currentPositions
    },
    userCommunications: [
      {
        type: 'operation_report',
        channel: 'feishu',
        deliveryStatus: 'pending_external_delivery',
        summary: messageSummary
      }
    ],
    dataLineage: {
      snapshotsFile: input.snapshotsFile,
      llmDecisionFile: input.llmDecisionFile || null,
      runtimeVersion: 'overnight-holding-v1'
    },
    exceptionsAndFallbacks: [
      ...(externalLlmDecision ? [] : [{ type: 'llm_decision_missing', fallback: 'runtime_fallback' }]),
      ...decisions
        .filter((item) => item.rawSource)
        .map((item) => ({
        type: 'sell_review_source',
        symbol: item.symbol,
        fallback: item.rawSource
        }))
    ]
  });

  printJson({
    ...payload,
    dryRun: input.dryRun
  });
}
