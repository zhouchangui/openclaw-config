function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

export function evaluateMarketRegime(input = {}) {
  const mainThemeClarity = clampScore(input.mainThemeClarity);
  const sectorBreadthConcentration = clampScore(input.sectorBreadthConcentration);
  const afternoonStrengthRetention = clampScore(input.afternoonStrengthRetention);
  const coreLeaderConfirmation = clampScore(input.coreLeaderConfirmation);

  const sectorContinuityScore = Math.round(
    (mainThemeClarity * 0.3) +
    (sectorBreadthConcentration * 0.2) +
    (afternoonStrengthRetention * 0.25) +
    (coreLeaderConfirmation * 0.25)
  );

  const reasons = [];
  const warnings = [];

  if (mainThemeClarity >= 70) {
    reasons.push('主线方向清晰，可聚焦强势延续');
  } else {
    warnings.push('主线辨识度不足，容易落入混沌轮动');
  }

  if (sectorBreadthConcentration >= 65) {
    reasons.push('资金集中在少数主线板块，延续性基础较好');
  } else {
    warnings.push('板块分散度偏高，持续性可能不足');
  }

  if (afternoonStrengthRetention >= 65) {
    reasons.push('午后强度保留较好，不是单纯上午脉冲');
  } else {
    warnings.push('午后强度衰减明显，隔夜博弈胜率下降');
  }

  if (coreLeaderConfirmation >= 70) {
    reasons.push('核心股强度仍在，板块锚点明确');
  } else {
    warnings.push('核心股确认不足，次日承接存在不确定性');
  }

  const tradable = (
    sectorContinuityScore >= 70 &&
    mainThemeClarity >= 65 &&
    afternoonStrengthRetention >= 60 &&
    coreLeaderConfirmation >= 60
  );

  return {
    tradable,
    sectorContinuityScore,
    breakdown: {
      mainThemeClarity,
      sectorBreadthConcentration,
      afternoonStrengthRetention,
      coreLeaderConfirmation
    },
    reasons,
    warnings
  };
}
