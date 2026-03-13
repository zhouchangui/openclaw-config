import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateMarketRegime } from './market-regime.mjs';
import { scoreCandidates } from './score-candidates.mjs';
import { createStateStore } from './state-store.mjs';
import {
  applyBuyToState,
  buildFallbackBuyDecision,
  buildPortfolioDecision,
  ensurePortfolioState,
  normalizeBuyAllocations
} from './portfolio.mjs';
import { createAuditStore } from './audit-store.mjs';
import { resolveSelectionLlmDecision } from './agent-decision.mjs';

function resolveRuntimeRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function writeText(filePath, content) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
}

function buildSelectionPaths(workspaceRoot, tradingDate) {
  return {
    dataPath: path.join(workspaceRoot, 'data', 'overnight-holding', `${tradingDate}.selection.json`),
    markdownPath: path.join(workspaceRoot, 'reports', 'overnight-holding', `${tradingDate}.selection.md`)
  };
}

function resolveDefaultFixture(relativePath) {
  return path.join(resolveRuntimeRoot(), 'fixtures', relativePath);
}

function resolveVariants(variant) {
  return variant === 'both' ? ['leader', 'midcore'] : [variant];
}

function buildCandidatePool(selectedCandidates) {
  const bySymbol = new Map();

  for (const [variant, ranked] of Object.entries(selectedCandidates)) {
    for (const candidate of ranked) {
      const entry = {
        ...candidate,
        pickedVariant: variant,
        passedRules: !candidate.rejectReason
      };
      const existing = bySymbol.get(candidate.symbol);
      if (!existing || Number(entry.totalScore || 0) > Number(existing.totalScore || 0)) {
        bySymbol.set(candidate.symbol, entry);
      }
    }
  }

  return Array.from(bySymbol.values());
}

function buildSummary({ tradingDate, marketGate, virtualBuys, status, llmDecisionJson }) {
  const title = `隔日持股 ${tradingDate} 操作报告`;

  if (!status.enabled) {
    return [
      title,
      '结论：策略当前处于暂停状态，本次未执行新的虚拟买入。',
      '请通过飞书确认是否恢复策略，再继续下一次买入。'
    ].join('\n');
  }

  if (!marketGate.tradable) {
    return [
      title,
      `结论：当前主线延续性不足（${marketGate.sectorContinuityScore} 分），已触发市场停止。`,
      '已记录停止事件，并将在行情转强时先通过飞书询问是否恢复执行。'
    ].join('\n');
  }

  if (llmDecisionJson.action === 'no_buy') {
    return [
      title,
      '结论：市场允许观察，但 LLM 最终决定今天不买入。',
      `放弃理由：${(llmDecisionJson.rejectedCandidates || []).map((item) => `${item.symbol}:${item.reason}`).join('、') || '无'}`
    ].join('\n');
  }

  const symbols = virtualBuys.map((item) => `${item.symbol}(${item.pickedVariant})`).join('、') || '无';

  return [
    title,
    `结论：主线可交易，生成 ${virtualBuys.length} 笔虚拟买入。`,
    `候选：${symbols}`
  ].join('\n');
}

function buildMarkdown({ tradingDate, marketGate, selectedCandidates, virtualBuys, status, llmDecisionJson, portfolioDecision }) {
  const lines = [
    `# 隔日持股 ${tradingDate} 选股记录`,
    '',
    `- 主线延续分：${marketGate.sectorContinuityScore}`,
    `- 可交易：${marketGate.tradable ? '是' : '否'}`,
    `- 策略启用：${status.enabled ? '是' : '否'}`,
    `- 当日可动用资金：${portfolioDecision.actualDeployAmount}`,
    ''
  ];

  if (virtualBuys.length > 0) {
    lines.push('## 虚拟买入');
    virtualBuys.forEach((item) => {
      lines.push(`- ${item.name}（${item.symbol}）/${item.pickedVariant} / ${item.totalScore} 分 / ${item.allocatedWeightPct}% / ${item.allocatedAmount}`);
    });
    lines.push('');
  }

  lines.push('## LLM 最终决策 JSON');
  lines.push('```json');
  lines.push(JSON.stringify(llmDecisionJson, null, 2));
  lines.push('```');
  lines.push('');

  lines.push('## 候选排名');
  for (const [variant, ranked] of Object.entries(selectedCandidates)) {
    lines.push(`### ${variant}`);
    ranked.forEach((item) => {
      lines.push(`- ${item.name}（${item.symbol}）：${item.totalScore} 分${item.rejectReason ? ` / reject=${item.rejectReason}` : ''}`);
    });
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

function syncPosition(state, virtualBuy, tradingDate) {
  const existing = state.currentPositions.find((position) => position.symbol === virtualBuy.symbol && position.status === 'open');
  if (existing) {
    existing.lastSelectedOn = tradingDate;
    existing.variant = virtualBuy.pickedVariant;
    return;
  }

  state.currentPositions.push({
    symbol: virtualBuy.symbol,
    name: virtualBuy.name,
    variant: virtualBuy.pickedVariant,
    openedOn: tradingDate,
    status: 'open'
  });
}

export async function buildSelectionPackage({
  tradingDate,
  variant = 'both',
  workspaceRoot,
  marketFile,
  candidatesFile,
  llmDecisionFile,
  dryRun = false
}) {
  const resolvedWorkspaceRoot = workspaceRoot;
  const marketSnapshot = await readJson(marketFile || resolveDefaultFixture('market-regime.good.json'));
  const candidateSnapshot = await readJson(candidatesFile || resolveDefaultFixture('candidates.sample.json'));
  const externalLlmDecision = llmDecisionFile ? await readJson(llmDecisionFile) : null;
  const marketGate = evaluateMarketRegime(marketSnapshot);
  const store = createStateStore({ workspaceRoot: resolvedWorkspaceRoot });
  const auditStore = createAuditStore({ workspaceRoot: resolvedWorkspaceRoot });
  const state = await store.loadState();
  ensurePortfolioState(state);
  const selectedCandidates = {};

  for (const item of resolveVariants(variant)) {
    selectedCandidates[item] = scoreCandidates({
      variant: item,
      sectorContinuityScore: marketGate.sectorContinuityScore,
      candidates: candidateSnapshot.candidates
    }).ranked;
  }

  if (!marketGate.tradable) {
    await store.recordStopEvent({
      type: 'market_stop',
      tradingDate,
      reason: 'sector_continuity_below_threshold'
    });
  }

  let refreshedState = marketGate.tradable ? state : await store.loadState();
  if (marketGate.tradable && !refreshedState.status.enabled && refreshedState.status.resumeRequired) {
    refreshedState = await store.requestResume({
      tradingDate,
      reason: 'market_recovered_waiting_user_confirmation'
    });
  }

  const status = refreshedState.status;
  const candidatePool = buildCandidatePool(selectedCandidates).map((item) => ({
    ...item,
    rawData: candidateSnapshot.candidates.find((candidate) => candidate.symbol === item.symbol)?.raw || null
  }));
  const portfolioDecision = buildPortfolioDecision({
    state: refreshedState,
    selectedCount: candidatePool.filter((item) => item.passedRules).length
  });
  const fallbackDecision = buildFallbackBuyDecision({
    candidatePool,
    portfolioDecision,
    marketGate
  });
  const llmResolution = externalLlmDecision
    ? {
      decision: externalLlmDecision,
      source: 'file',
      agentMeta: null,
      fallbackError: null
    }
    : await resolveSelectionLlmDecision({
      tradingDate,
      dryRun,
      llmDecisionFile: null,
      marketContext: {
        ...marketSnapshot,
        tradable: marketGate.tradable,
        warnings: marketGate.warnings,
        reasons: marketGate.reasons
      },
      portfolioDecision,
      candidatePool,
      fallbackDecision
    });
  const llmDecisionJson = llmResolution.decision;
  const virtualBuys = marketGate.tradable && status.enabled
    ? normalizeBuyAllocations({
      llmDecisionJson,
      portfolioDecision,
      candidatePool
    })
    : [];
  const executionLog = [];

  if (marketGate.tradable && status.enabled && llmDecisionJson.action === 'buy') {
    for (const virtualBuy of virtualBuys) {
      executionLog.push(applyBuyToState({
        state: refreshedState,
        tradingDate,
        virtualBuy: {
          ...virtualBuy,
          decisionPrice: virtualBuy.rawData?.decisionPrice || virtualBuy.rawData?.close || null
        }
      }));
    }
  } else if (!marketGate.tradable) {
    executionLog.push({
      type: 'no_buy',
      reason: 'market_not_tradable'
    });
  } else if (llmDecisionJson.action === 'no_buy') {
    executionLog.push({
      type: 'no_buy',
      reason: 'llm_declined_to_buy'
    });
  }

  refreshedState.selectionJournal.push({
    tradingDate,
    variant,
    tradable: marketGate.tradable,
    selectedCount: virtualBuys.length,
    sectorContinuityScore: marketGate.sectorContinuityScore
  });
  await store.saveState(refreshedState);
  await store.appendJournalEvent(tradingDate, 'selection', {
    type: 'selection_completed',
    variant,
    tradable: marketGate.tradable,
    selectedCount: virtualBuys.length
  });

  const messageSummary = buildSummary({
    tradingDate,
    marketGate,
    virtualBuys,
    status: refreshedState.status,
    llmDecisionJson
  });
  const { dataPath, markdownPath } = buildSelectionPaths(resolvedWorkspaceRoot, tradingDate);
  const payload = {
    ok: true,
    phase: 'selection',
    tradingDate,
    variant,
    marketGate,
    selectedCandidates,
    candidatePool,
    virtualBuys,
    llmDecisionJson,
    portfolioDecision,
    executionLog,
    messageSummary,
    dataPath,
    markdownPath,
    dataSourceMode: dryRun ? 'fixtures' : 'external-files'
  };

  await writeText(dataPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeText(markdownPath, buildMarkdown({
    tradingDate,
    marketGate,
    selectedCandidates,
    virtualBuys,
    status: refreshedState.status,
    llmDecisionJson,
    portfolioDecision
  }));

  await auditStore.recordSelectionAudit({
    tradingDate,
    marketContext: {
      ...marketSnapshot,
      tradable: marketGate.tradable,
      sectorContinuityScore: marketGate.sectorContinuityScore,
      warnings: marketGate.warnings,
      reasons: marketGate.reasons
    },
    candidatePool,
    ruleEngineResult: {
      blocked: !marketGate.tradable,
      passedCandidates: candidatePool.filter((item) => item.passedRules).map((item) => item.symbol)
    },
    llmDecisionJson,
    portfolioDecision,
    executionLog,
    positionSnapshots: {
      beforeMarket: state.currentPositions,
      afterSelection: refreshedState.currentPositions
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
      marketFile: marketFile || resolveDefaultFixture('market-regime.good.json'),
      candidatesFile: candidatesFile || resolveDefaultFixture('candidates.sample.json'),
      llmDecisionFile: llmDecisionFile || null,
      llmDecisionSource: llmResolution.source,
      llmAgentSessionId: llmResolution.agentMeta?.sessionId || null,
      llmAgentModel: llmResolution.agentMeta?.model || null,
      llmAgentProvider: llmResolution.agentMeta?.provider || null,
      runtimeVersion: 'overnight-holding-v1'
    },
    exceptionsAndFallbacks: [
      ...(dryRun ? [{ type: 'fixture_mode' }] : []),
      ...(llmResolution.source === 'runtime_fallback'
        ? [{
          type: 'llm_decision_missing',
          fallback: 'runtime_fallback',
          reason: llmResolution.fallbackError
        }]
        : [])
    ]
  });

  return payload;
}
