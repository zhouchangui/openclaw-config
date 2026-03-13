export const STRATEGY_CONFIG = {
  initialCapital: 100000,
  maxDailyDeployPct: 50,
  maxNewPositionsPerDay: 3,
  maxConcurrentPositions: 3,
  cashBufferPct: 30,
  sizingModel: 'score_weighted',
  llmMode: 'llm_primary_rules_assist',
  ruleVetoModel: 'extreme_only',
  weakMarketBehavior: 'counter_trend_probe_with_user_confirmation',
  llmOutputContract: 'structured_json',
  rawDataStorage: 'full_embedded',
  llmTracePolicy: 'final_json_only',
  pricing: {
    virtualFillModel: 'dual_record',
    buySlippageBps: 10,
    sellSlippageBps: 15,
    commissionBps: 3,
    stampDutyBps: 10
  }
};
