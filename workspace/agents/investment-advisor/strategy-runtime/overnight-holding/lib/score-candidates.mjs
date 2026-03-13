function clampScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function buildSharedScore(candidate, sectorContinuityScore, variant) {
  const stockStrength = variant === 'leader'
    ? Math.round(
      (clampScore(candidate.boardLeadership) * 0.55) +
      (clampScore(candidate.themeResonance) * 0.45)
    )
    : Math.round(
      (clampScore(candidate.liquidityStability) * 0.52) +
      (clampScore(candidate.trendIntegrity) * 0.48)
    );
  const afternoonSupport = clampScore(candidate.afternoonSupport);
  const nextDayRealizability = clampScore(candidate.nextDayRealizability);

  return {
    sectorContinuity: Math.round(clampScore(sectorContinuityScore) * 0.35),
    stockStrength: Math.round(stockStrength * 0.30),
    afternoonSupport: Math.round(afternoonSupport * 0.20),
    nextDayRealizability: Math.round(nextDayRealizability * 0.15)
  };
}

function buildVariantBonus(candidate, variant) {
  if (variant === 'leader') {
    return Math.round(
      (clampScore(candidate.boardLeadership) * 0.12) +
      (clampScore(candidate.themeResonance) * 0.08)
    );
  }

  return Math.round(
    (clampScore(candidate.liquidityStability) * 0.11) +
    (clampScore(candidate.trendIntegrity) * 0.09)
  );
}

function buildSelectionReasons(candidate, variant) {
  if (variant === 'leader') {
    return [
      '板块内辨识度更强',
      '主线共振更高',
      '适合强势延续型博弈'
    ];
  }

  return [
    '流动性与承接更稳',
    '趋势结构更完整',
    '次日兑现性更好'
  ];
}

export function scoreCandidates({ variant, sectorContinuityScore, candidates = [] } = {}) {
  const ranked = candidates.map((candidate) => {
    const continuity = clampScore(sectorContinuityScore);
    const rejectReason = continuity < 65 ? 'sector_continuity_below_threshold' : null;
    const shared = buildSharedScore(candidate, continuity, variant);
    const variantBonus = buildVariantBonus(candidate, variant);
    const totalScore = Object.values(shared).reduce((sum, item) => sum + item, 0) + variantBonus;

    return {
      symbol: candidate.symbol,
      name: candidate.name,
      variant,
      totalScore,
      rejectReason,
      selectionReasons: rejectReason ? [] : buildSelectionReasons(candidate, variant),
      breakdown: {
        ...shared,
        variantBonus
      }
    };
  }).sort((a, b) => b.totalScore - a.totalScore);

  return { variant, ranked };
}
