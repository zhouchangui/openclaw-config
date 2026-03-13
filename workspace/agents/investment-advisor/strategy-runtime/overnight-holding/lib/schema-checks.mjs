function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function validateSelectionInput(input = {}) {
  const issues = [];
  if (!isIsoDate(input.tradingDate)) {
    issues.push('tradingDate must be YYYY-MM-DD');
  }
  if (!['leader', 'midcore', 'both'].includes(input.variant)) {
    issues.push('variant must be leader, midcore, or both');
  }
  if (!input.dryRun) {
    const hasMarketFile = Boolean(input.marketFile);
    const hasCandidatesFile = Boolean(input.candidatesFile);
    if (hasMarketFile !== hasCandidatesFile) {
      issues.push('marketFile and candidatesFile must be provided together');
    }
  }
  return { ok: issues.length === 0, issues };
}

export function validateSellReviewInput(input = {}) {
  const issues = [];
  if (!isIsoDate(input.tradingDate)) {
    issues.push('tradingDate must be YYYY-MM-DD');
  }
  if (!input.source) {
    issues.push('source is required');
  }
  if (!input.dryRun && !input.snapshotsFile) {
    issues.push('snapshotsFile is required when dryRun is false');
  }
  return { ok: issues.length === 0, issues };
}
