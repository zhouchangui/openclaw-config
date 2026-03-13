import { STRATEGY_CONFIG } from './strategy-config.mjs';

function toBpsRatio(bps) {
  return Number(bps || 0) / 10000;
}

export function ensurePortfolioState(state) {
  if (state.portfolio) {
    return state;
  }

  state.portfolio = {
    initialCapital: STRATEGY_CONFIG.initialCapital,
    cashBalance: STRATEGY_CONFIG.initialCapital,
    realizedPnl: 0,
    feesPaid: 0
  };
  return state;
}

export function getOpenPositions(state) {
  return state.currentPositions.filter((item) => item.status === 'open');
}

export function buildPortfolioDecision({ state, selectedCount }) {
  ensurePortfolioState(state);
  const reservedCashFloor = Math.round(
    STRATEGY_CONFIG.initialCapital * (STRATEGY_CONFIG.cashBufferPct / 100)
  );
  const deployableToday = Math.round(
    STRATEGY_CONFIG.initialCapital * (STRATEGY_CONFIG.maxDailyDeployPct / 100)
  );
  const availableCash = Math.max(0, state.portfolio.cashBalance - reservedCashFloor);
  const actualDeployAmount = Math.min(deployableToday, availableCash);
  const openCount = getOpenPositions(state).length;
  const availableSlots = Math.max(0, STRATEGY_CONFIG.maxConcurrentPositions - openCount);
  const cappedSelectedCount = Math.min(
    selectedCount,
    availableSlots,
    STRATEGY_CONFIG.maxNewPositionsPerDay
  );

  return {
    initialCapital: STRATEGY_CONFIG.initialCapital,
    availableCash: state.portfolio.cashBalance,
    reservedCashFloor,
    deployableToday,
    actualDeployAmount,
    availableSlots,
    selectedCount: cappedSelectedCount
  };
}

export function buildFallbackBuyDecision({ candidatePool, portfolioDecision, marketGate }) {
  const passedCandidates = candidatePool.filter((item) => item.passedRules);

  if (!marketGate.tradable) {
    return {
      action: 'no_buy',
      buyList: [],
      rejectedCandidates: passedCandidates.map((item) => ({
        symbol: item.symbol,
        reason: 'market_not_tradable'
      })),
      principlesCited: ['市场环境优先'],
      riskFlags: ['market_not_tradable'],
      confidence: 'high',
      decisionMode: 'runtime_fallback'
    };
  }

  if (portfolioDecision.selectedCount === 0 || passedCandidates.length === 0) {
    return {
      action: 'no_buy',
      buyList: [],
      rejectedCandidates: passedCandidates.map((item) => ({
        symbol: item.symbol,
        reason: 'portfolio_capacity_or_cash_limit'
      })),
      principlesCited: ['仓位与现金约束优先'],
      riskFlags: ['portfolio_capacity_limit'],
      confidence: 'high',
      decisionMode: 'runtime_fallback'
    };
  }

  const selected = passedCandidates
    .sort((a, b) => Number(b.totalScore || 0) - Number(a.totalScore || 0))
    .slice(0, portfolioDecision.selectedCount);
  const totalScore = selected.reduce((sum, item) => sum + Number(item.totalScore || 0), 0) || 1;

  return {
    action: 'buy',
    buyList: selected.map((item) => ({
      symbol: item.symbol,
      name: item.name,
      weightPct: Math.round((Number(item.totalScore || 0) / totalScore) * 100),
      reason: (item.selectionReasons || []).join('；')
    })),
    rejectedCandidates: passedCandidates
      .filter((item) => !selected.find((picked) => picked.symbol === item.symbol))
      .map((item) => ({
        symbol: item.symbol,
        reason: 'not_selected_by_runtime_fallback'
      })),
    principlesCited: ['强势延续优先', '评分加权分配'],
    riskFlags: [],
    confidence: 'medium',
    decisionMode: 'runtime_fallback'
  };
}

export function normalizeBuyAllocations({ llmDecisionJson, portfolioDecision, candidatePool }) {
  const allocations = [];
  const totalWeight = (llmDecisionJson.buyList || []).reduce((sum, item) => sum + Number(item.weightPct || 0), 0) || 1;

  for (const item of llmDecisionJson.buyList || []) {
    const candidate = candidatePool.find((entry) => entry.symbol === item.symbol);
    if (!candidate) continue;
    const weightPct = Math.round((Number(item.weightPct || 0) / totalWeight) * 100);
    const allocationAmount = Math.round(portfolioDecision.actualDeployAmount * (weightPct / 100));
    allocations.push({
      ...candidate,
      allocatedWeightPct: weightPct,
      allocatedAmount: allocationAmount
    });
  }

  return allocations;
}

export function estimateBuyFill({ price }) {
  if (!Number.isFinite(Number(price)) || Number(price) <= 0) {
    return {
      decisionPrice: null,
      auditFillPrice: null,
      grossCost: null,
      totalFees: null
    };
  }

  const decisionPrice = Number(price);
  const auditFillPrice = decisionPrice * (1 + toBpsRatio(STRATEGY_CONFIG.pricing.buySlippageBps));
  const feeRatio = toBpsRatio(STRATEGY_CONFIG.pricing.commissionBps);

  return {
    decisionPrice,
    auditFillPrice,
    feeRatio
  };
}

export function estimateSellFill({ price }) {
  if (!Number.isFinite(Number(price)) || Number(price) <= 0) {
    return {
      observedPrice: null,
      auditFillPrice: null
    };
  }

  const observedPrice = Number(price);
  const auditFillPrice = observedPrice * (1 - toBpsRatio(STRATEGY_CONFIG.pricing.sellSlippageBps));

  return {
    observedPrice,
    auditFillPrice
  };
}

export function applyBuyToState({ state, tradingDate, virtualBuy }) {
  ensurePortfolioState(state);
  const fill = estimateBuyFill({ price: virtualBuy.decisionPrice });
  const quantity = fill.auditFillPrice
    ? Math.max(0, Math.floor(virtualBuy.allocatedAmount / fill.auditFillPrice))
    : null;
  const grossCost = quantity && fill.auditFillPrice ? quantity * fill.auditFillPrice : virtualBuy.allocatedAmount;
  const fee = grossCost ? grossCost * toBpsRatio(STRATEGY_CONFIG.pricing.commissionBps) : 0;

  state.portfolio.cashBalance -= Math.round((grossCost || 0) + fee);
  state.portfolio.feesPaid += Math.round(fee);
  state.virtualBuys.push({
    symbol: virtualBuy.symbol,
    name: virtualBuy.name,
    tradingDate,
    variant: virtualBuy.pickedVariant,
    score: virtualBuy.totalScore,
    allocatedAmount: virtualBuy.allocatedAmount,
    allocatedWeightPct: virtualBuy.allocatedWeightPct,
    decisionPrice: fill.decisionPrice,
    auditFillPrice: fill.auditFillPrice,
    quantity
  });
  state.currentPositions.push({
    symbol: virtualBuy.symbol,
    name: virtualBuy.name,
    variant: virtualBuy.pickedVariant,
    openedOn: tradingDate,
    status: 'open',
    allocatedAmount: virtualBuy.allocatedAmount,
    allocatedWeightPct: virtualBuy.allocatedWeightPct,
    decisionPrice: fill.decisionPrice,
    auditFillPrice: fill.auditFillPrice,
    quantity
  });

  return {
    type: 'buy_executed',
    symbol: virtualBuy.symbol,
    allocatedAmount: virtualBuy.allocatedAmount,
    allocatedWeightPct: virtualBuy.allocatedWeightPct,
    decisionPrice: fill.decisionPrice,
    auditFillPrice: fill.auditFillPrice,
    quantity
  };
}

export function applySellToState({ state, tradingDate, position, decision, auditFillPrice }) {
  ensurePortfolioState(state);
  const fill = estimateSellFill({ price: auditFillPrice });
  const quantity = Number(position.quantity || 0);
  const grossProceeds = quantity && fill.auditFillPrice ? quantity * fill.auditFillPrice : null;
  const sellFeeRatio = toBpsRatio(STRATEGY_CONFIG.pricing.commissionBps + STRATEGY_CONFIG.pricing.stampDutyBps);
  const sellFees = grossProceeds ? grossProceeds * sellFeeRatio : 0;
  const costBasis = quantity && Number(position.auditFillPrice || 0)
    ? quantity * Number(position.auditFillPrice || 0)
    : Number(position.allocatedAmount || 0);
  const grossPnl = grossProceeds !== null ? grossProceeds - costBasis : null;
  const netPnl = grossPnl !== null ? grossPnl - sellFees : null;

  position.status = 'closed';
  position.closedOn = tradingDate;
  position.lastReviewAction = decision.action;
  position.closeDecisionPrice = fill.observedPrice;
  position.closeAuditFillPrice = fill.auditFillPrice;
  position.grossPnl = grossPnl;
  position.netPnl = netPnl;

  if (grossProceeds !== null) {
    state.portfolio.cashBalance += Math.round(grossProceeds - sellFees);
  }
  state.portfolio.feesPaid += Math.round(sellFees);
  state.portfolio.realizedPnl += Math.round(netPnl || 0);

  return {
    type: 'sell_executed',
    symbol: position.symbol,
    action: decision.action,
    decisionPrice: fill.observedPrice,
    auditFillPrice: fill.auditFillPrice,
    grossPnl,
    netPnl
  };
}
