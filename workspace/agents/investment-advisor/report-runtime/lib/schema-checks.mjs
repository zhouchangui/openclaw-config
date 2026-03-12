const REPORT_TYPES = new Set(['morning', 'closing', 'news']);
const REPORT_STATUSES = new Set(['draft', 'partial', 'ready', 'published', 'failed']);
const FALLBACK_LEVELS = new Set(['none', 'mild', 'strong']);
const SOURCE_STATUSES = new Set(['ok', 'partial', 'failed']);

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isScalar(value) {
  return ['string', 'number', 'boolean'].includes(typeof value);
}

function pushIssue(issues, condition, message) {
  if (condition) {
    issues.push(message);
  }
}

export function validateSharedReport(reportData) {
  const issues = [];

  pushIssue(issues, !reportData || typeof reportData !== 'object', 'reportData must be an object.');
  if (issues.length > 0) {
    return { ok: false, status: 'failed', issues };
  }

  pushIssue(issues, !isNonEmptyString(reportData.reportId), 'reportId is required.');
  pushIssue(
    issues,
    !REPORT_TYPES.has(reportData.reportType),
    'reportType must be one of morning, closing, news.'
  );
  pushIssue(issues, !isNonEmptyString(reportData.title), 'title is required.');
  pushIssue(issues, !isNonEmptyString(reportData.summary), 'summary is required.');
  pushIssue(issues, !isNonEmptyString(reportData.tradingDate), 'tradingDate is required.');
  pushIssue(issues, !isNonEmptyString(reportData.generatedAt), 'generatedAt is required.');
  pushIssue(issues, !isNonEmptyString(reportData.timezone), 'timezone is required.');
  pushIssue(issues, !isNonEmptyString(reportData.marketScope), 'marketScope is required.');
  pushIssue(
    issues,
    !REPORT_STATUSES.has(reportData.status),
    'status must be one of draft, partial, ready, published, failed.'
  );
  pushIssue(
    issues,
    !FALLBACK_LEVELS.has(reportData.fallbackLevel),
    'fallbackLevel must be one of none, mild, strong.'
  );

  pushIssue(
    issues,
    !reportData.conclusion || !isNonEmptyString(reportData.conclusion.text),
    'conclusion.text is required.'
  );
  pushIssue(
    issues,
    !Array.isArray(reportData.conclusion?.tags) ||
      !reportData.conclusion.tags.every(isNonEmptyString),
    'conclusion.tags must be an array of strings.'
  );

  pushIssue(
    issues,
    !Array.isArray(reportData.summaryCards),
    'summaryCards must be an array.'
  );
  if (Array.isArray(reportData.summaryCards)) {
    reportData.summaryCards.forEach((card, index) => {
      pushIssue(
        issues,
        !isNonEmptyString(card?.title),
        `summaryCards[${index}].title is required.`
      );
      pushIssue(
        issues,
        !isNonEmptyString(card?.text),
        `summaryCards[${index}].text is required.`
      );
    });
  }

  pushIssue(issues, !Array.isArray(reportData.risks), 'risks must be an array.');
  if (Array.isArray(reportData.risks)) {
    pushIssue(
      issues,
      !reportData.risks.every(isNonEmptyString),
      'risks entries must all be strings.'
    );
  }

  pushIssue(issues, !Array.isArray(reportData.detailRows), 'detailRows must be an array.');
  if (Array.isArray(reportData.detailRows)) {
    reportData.detailRows.forEach((row, index) => {
      ['dimension', 'value', 'change', 'interpretation'].forEach((key) => {
        pushIssue(
          issues,
          !isScalar(row?.[key]),
          `detailRows[${index}].${key} must be a scalar value.`
        );
      });
    });
  }

  pushIssue(issues, !Array.isArray(reportData.sources), 'sources must be an array.');
  if (Array.isArray(reportData.sources)) {
    reportData.sources.forEach((source, index) => {
      pushIssue(
        issues,
        !isNonEmptyString(source?.name),
        `sources[${index}].name is required.`
      );
      pushIssue(
        issues,
        !SOURCE_STATUSES.has(source?.status),
        `sources[${index}].status must be one of ok, partial, failed.`
      );
      pushIssue(
        issues,
        !isNonEmptyString(source?.timestamp),
        `sources[${index}].timestamp is required.`
      );
    });
  }

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? reportData.status : 'failed',
    issues
  };
}
