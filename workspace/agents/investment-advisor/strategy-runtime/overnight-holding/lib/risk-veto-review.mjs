const FINAL_REVIEW_SCOPE = 'final_pre_execution';

function normalizeRiskFlags(llmDecisionJson) {
  return Array.isArray(llmDecisionJson?.riskFlags)
    ? llmDecisionJson.riskFlags.filter((item) => typeof item === 'string' && item.trim())
    : [];
}

function buildDecisionReason(decision, riskFlags, portfolioDecision, virtualBuys) {
  if (decision === 'veto') {
    return '检测到 gap_risk_limit_breach，阻止本次最终执行。';
  }

  if (decision === 'ask_user_first') {
    return '检测到 overnight_event_risk_requires_confirmation，需先征求用户确认。';
  }

  if (decision === 'reduce') {
    return `候选买入数 ${virtualBuys.length} 超出当前可用仓位 ${portfolioDecision.availableSlots || 0}，需缩减后再执行。`;
  }

  return riskFlags.length > 0
    ? `未命中最终否决规则，保留风险提示：${riskFlags.join('、')}。`
    : '未发现需要阻止执行的最终风险标记。';
}

export function reviewFinalRiskVeto({
  tradingDate,
  marketSnapshot,
  marketGate,
  status,
  llmDecisionJson,
  candidatePool,
  virtualBuys,
  portfolioDecision
}) {
  const riskFlags = normalizeRiskFlags(llmDecisionJson);
  let decision = 'allow';

  if (riskFlags.includes('gap_risk_limit_breach')) {
    decision = 'veto';
  } else if (riskFlags.includes('overnight_event_risk_requires_confirmation')) {
    decision = 'ask_user_first';
  } else if (
    llmDecisionJson?.action === 'buy'
    && virtualBuys.length > 0
    && virtualBuys.length > Number(portfolioDecision?.availableSlots || 0)
  ) {
    decision = 'reduce';
  }

  return {
    scope: FINAL_REVIEW_SCOPE,
    tradingDate,
    decision,
    blockedExecution: decision !== 'allow',
    llmAction: llmDecisionJson?.action || 'unknown',
    riskFlags,
    reason: buildDecisionReason(decision, riskFlags, portfolioDecision || {}, virtualBuys || []),
    marketGate: {
      tradable: Boolean(marketGate?.tradable),
      sectorContinuityScore: marketGate?.sectorContinuityScore ?? null,
      warnings: marketGate?.warnings || []
    },
    status: {
      enabled: Boolean(status?.enabled),
      resumeRequired: Boolean(status?.resumeRequired)
    },
    candidatePoolSize: Array.isArray(candidatePool) ? candidatePool.length : 0,
    virtualBuyCount: Array.isArray(virtualBuys) ? virtualBuys.length : 0,
    portfolioSnapshot: {
      actualDeployAmount: portfolioDecision?.actualDeployAmount ?? null,
      availableSlots: portfolioDecision?.availableSlots ?? null,
      selectedCount: portfolioDecision?.selectedCount ?? null
    },
    marketSnapshot: marketSnapshot
      ? {
        tradingDate: marketSnapshot.tradingDate || tradingDate,
        mainThemeClarity: marketSnapshot.mainThemeClarity ?? null,
        riskAppetite: marketSnapshot.riskAppetite ?? null
      }
      : null
  };
}
