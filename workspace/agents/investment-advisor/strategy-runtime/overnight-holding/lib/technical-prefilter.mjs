const MAX_TECHNICAL_CANDIDATES = 50;
const DEFAULT_SCOPE = 'full-market';
const REQUIRED_FILTER = 'overnight-holding-technical';

function toNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, toNumber(value)));
}

export function buildTechnicalScore(candidate) {
  return (
    (clampScore(candidate.boardLeadership) * 0.20) +
    (clampScore(candidate.themeResonance) * 0.22) +
    (clampScore(candidate.liquidityStability) * 0.12) +
    (clampScore(candidate.trendIntegrity) * 0.18) +
    (clampScore(candidate.afternoonSupport) * 0.10) +
    (clampScore(candidate.nextDayRealizability) * 0.18)
  );
}

function normalizeFilters(filters = []) {
  const values = Array.isArray(filters) ? filters.filter(Boolean) : [];
  return values.includes(REQUIRED_FILTER) ? values : [...values, REQUIRED_FILTER];
}

function normalizeCandidates(candidates = []) {
  return candidates
    .filter((candidate) => candidate && candidate.symbol && candidate.name)
    .map((candidate) => ({ ...candidate }))
    .sort((left, right) => buildTechnicalScore(right) - buildTechnicalScore(left))
    .slice(0, MAX_TECHNICAL_CANDIDATES);
}

export function applyTechnicalPrefilter({
  candidateSnapshot,
  prefilterSummary,
  scope = DEFAULT_SCOPE
} = {}) {
  const originalCandidates = Array.isArray(candidateSnapshot?.candidates)
    ? candidateSnapshot.candidates
    : [];
  const candidates = normalizeCandidates(originalCandidates);

  return {
    candidateSnapshot: {
      ...(candidateSnapshot || {}),
      candidates
    },
    prefilterSummary: {
      ...(prefilterSummary || {}),
      scope: prefilterSummary?.scope || scope,
      filters: normalizeFilters(prefilterSummary?.filters),
      rawUniverseCount:
        toNumber(prefilterSummary?.rawUniverseCount)
        || toNumber(prefilterSummary?.universeCount)
        || originalCandidates.length,
      tradableUniverseCount:
        toNumber(prefilterSummary?.tradableUniverseCount)
        || toNumber(prefilterSummary?.eligibleRows)
        || originalCandidates.length,
      technicalCandidatesCount: candidates.length,
      maxTechnicalCandidates: MAX_TECHNICAL_CANDIDATES,
      universeCount:
        toNumber(prefilterSummary?.universeCount)
        || toNumber(prefilterSummary?.rawUniverseCount)
        || originalCandidates.length,
      eligibleRows:
        toNumber(prefilterSummary?.eligibleRows)
        || toNumber(prefilterSummary?.tradableUniverseCount)
        || originalCandidates.length
    }
  };
}
