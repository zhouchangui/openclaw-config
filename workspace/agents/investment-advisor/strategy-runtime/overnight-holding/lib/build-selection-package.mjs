import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateMarketRegime } from './market-regime.mjs';
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
import { resolveSelectionInputs } from './live-selection-inputs.mjs';
import { reviewFinalRiskVeto } from './risk-veto-review.mjs';
import { buildTechnicalScore } from './technical-prefilter.mjs';

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

function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function buildProfileScore(candidate, variant) {
  if (variant === 'leader') {
    return Math.round(
      (clampScore(candidate.boardLeadership) * 0.55) +
      (clampScore(candidate.themeResonance) * 0.45)
    );
  }

  return Math.round(
    (clampScore(candidate.liquidityStability) * 0.52) +
    (clampScore(candidate.trendIntegrity) * 0.48)
  );
}

function resolveDominantVariant(candidate) {
  return buildProfileScore(candidate, 'leader') >= buildProfileScore(candidate, 'midcore')
    ? 'leader'
    : 'midcore';
}

function buildCandidateSelectionReasons(candidate, variant) {
  const profileReason = variant === 'leader'
    ? '龙头辨识度更强'
    : '趋势与流动性更稳';

  return [
    '技术预筛通过',
    profileReason,
    '等待 LLM 结合上下文做最终取舍'
  ];
}

function buildCandidatePool(candidateSnapshot) {
  return (candidateSnapshot.candidates || []).map((candidate) => {
    const pickedVariant = resolveDominantVariant(candidate);
    const totalScore = Math.round(buildTechnicalScore(candidate));

    return {
      symbol: candidate.symbol,
      name: candidate.name,
      variant: pickedVariant,
      pickedVariant,
      totalScore,
      rejectReason: null,
      passedRules: true,
      selectionReasons: buildCandidateSelectionReasons(candidate, pickedVariant),
      breakdown: {
        technicalScore: totalScore,
        leaderProfileScore: buildProfileScore(candidate, 'leader'),
        midcoreProfileScore: buildProfileScore(candidate, 'midcore'),
        boardLeadership: clampScore(candidate.boardLeadership),
        themeResonance: clampScore(candidate.themeResonance),
        liquidityStability: clampScore(candidate.liquidityStability),
        trendIntegrity: clampScore(candidate.trendIntegrity),
        afternoonSupport: clampScore(candidate.afternoonSupport),
        nextDayRealizability: clampScore(candidate.nextDayRealizability)
      },
      rawData: candidate.raw || null
    };
  });
}

function buildSelectedCandidateViews(candidatePool, variants) {
  return Object.fromEntries(variants.map((variant) => [
    variant,
    candidatePool.map((candidate) => ({
      symbol: candidate.symbol,
      name: candidate.name,
      variant,
      pickedVariant: candidate.pickedVariant,
      totalScore: candidate.totalScore,
      rejectReason: null,
      selectionReasons: buildCandidateSelectionReasons(candidate, candidate.pickedVariant),
      breakdown: {
        technicalScore: candidate.breakdown.technicalScore,
        leaderProfileScore: candidate.breakdown.leaderProfileScore,
        midcoreProfileScore: candidate.breakdown.midcoreProfileScore
      }
    }))
  ]));
}

function buildSummary({ tradingDate, marketGate, virtualBuys, status, llmDecisionJson, riskReview }) {
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

  if (riskReview && llmDecisionJson.action === 'buy' && riskReview.decision !== 'allow') {
    const decisionCopy = {
      veto: '最终风控否决，本次仅保留候选预览，不执行虚拟买入。',
      ask_user_first: '最终风控要求先征求用户确认，本次暂不执行虚拟买入。',
      reduce: '最终风控要求缩减仓位后再执行，本次暂不直接落地虚拟买入。'
    };

    return [
      title,
      `结论：${decisionCopy[riskReview.decision] || '最终风控阻止本次执行。'}`,
      `风险提示：${riskReview.reason}`
    ].join('\n');
  }

  const symbols = virtualBuys.map((item) => `${item.symbol}(${item.pickedVariant})`).join('、') || '无';

  return [
    title,
    `结论：主线可交易，生成 ${virtualBuys.length} 笔虚拟买入。`,
    `候选：${symbols}`
  ].join('\n');
}

function buildMarkdown({
  tradingDate,
  marketGate,
  selectedCandidates,
  virtualBuys,
  status,
  llmDecisionJson,
  portfolioDecision,
  prefilterSummary,
  riskReview
}) {
  const lines = [
    `# 隔日持股 ${tradingDate} 选股记录`,
    '',
    `- 主线延续分：${marketGate.sectorContinuityScore}`,
    `- 可交易：${marketGate.tradable ? '是' : '否'}`,
    `- 策略启用：${status.enabled ? '是' : '否'}`,
    `- 当日可动用资金：${portfolioDecision.actualDeployAmount}`
  ];

  if (prefilterSummary) {
    lines.push(`- 技术预筛范围：${prefilterSummary.scope}`);
    lines.push(`- 技术候选数：${prefilterSummary.technicalCandidatesCount}`);
  }

  lines.push(
    ''
  );

  if (riskReview) {
    lines.push(`- 最终风控决策：${riskReview.decision}`);
    lines.push(`- 最终风控说明：${riskReview.reason}`);
    lines.push('');
  }

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
  const store = createStateStore({ workspaceRoot: resolvedWorkspaceRoot });
  const auditStore = createAuditStore({ workspaceRoot: resolvedWorkspaceRoot });
  const state = await store.loadState();
  ensurePortfolioState(state);
  const inputResolution = await resolveSelectionInputs({
    tradingDate,
    dryRun,
    marketFile: marketFile || (dryRun ? resolveDefaultFixture('market-regime.good.json') : null),
    candidatesFile: candidatesFile || (dryRun ? resolveDefaultFixture('candidates.sample.json') : null)
  });
  const marketSnapshot = inputResolution.marketSnapshot;
  const candidateSnapshot = inputResolution.candidateSnapshot;
  const externalLlmDecision = llmDecisionFile ? await readJson(llmDecisionFile) : null;
  const marketGate = evaluateMarketRegime(marketSnapshot);
  const variants = resolveVariants(variant);
  const candidatePool = buildCandidatePool(candidateSnapshot);
  const selectedCandidates = buildSelectedCandidateViews(candidatePool, variants);

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
  const riskReview = reviewFinalRiskVeto({
    tradingDate,
    marketSnapshot,
    marketGate,
    status,
    llmDecisionJson,
    candidatePool,
    virtualBuys,
    portfolioDecision
  });
  const executionLog = [];
  const executionBlockedByRiskReview = marketGate.tradable
    && status.enabled
    && llmDecisionJson.action === 'buy'
    && riskReview.decision !== 'allow';

  if (marketGate.tradable && status.enabled && llmDecisionJson.action === 'buy' && !executionBlockedByRiskReview) {
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
  } else if (executionBlockedByRiskReview) {
    executionLog.push({
      type: 'no_buy',
      reason: 'blocked_by_risk_review',
      riskDecision: riskReview.decision
    });
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

  if (!executionBlockedByRiskReview) {
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
  }

  const messageSummary = buildSummary({
    tradingDate,
    marketGate,
    virtualBuys,
    status: refreshedState.status,
    llmDecisionJson,
    riskReview
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
    riskReview,
    executionLog,
    messageSummary,
    dataPath,
    markdownPath,
    dataSourceMode: inputResolution.dataSourceMode,
    inputDataSource: inputResolution.inputDataSource,
    prefilterSummary: inputResolution.prefilterSummary
  };

  await writeText(dataPath, `${JSON.stringify(payload, null, 2)}\n`);
  await writeText(markdownPath, buildMarkdown({
    tradingDate,
    marketGate,
    selectedCandidates,
    virtualBuys,
    status: refreshedState.status,
    llmDecisionJson,
    portfolioDecision,
    prefilterSummary: inputResolution.prefilterSummary,
    riskReview
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
    riskReview,
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
      ...inputResolution.dataLineage,
      llmDecisionFile: llmDecisionFile || null,
      llmDecisionSource: llmResolution.source,
      llmAgentSessionId: llmResolution.agentMeta?.sessionId || null,
      llmAgentModel: llmResolution.agentMeta?.model || null,
      llmAgentProvider: llmResolution.agentMeta?.provider || null,
      prefilterSummary: inputResolution.prefilterSummary || null,
      runtimeVersion: 'overnight-holding-v1'
    },
    exceptionsAndFallbacks: [
      ...(dryRun ? [{ type: 'fixture_mode' }] : []),
      ...(inputResolution.exceptionsAndFallbacks || []),
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
