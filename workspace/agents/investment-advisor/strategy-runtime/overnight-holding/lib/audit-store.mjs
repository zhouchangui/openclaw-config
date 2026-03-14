import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { STRATEGY_CONFIG } from './strategy-config.mjs';

function createRecordedEntry(entry) {
  return {
    ...entry,
    recordedAt: entry.recordedAt || new Date().toISOString()
  };
}

function createAuditDay(tradingDate) {
  return {
    auditVersion: 1,
    tradingDate,
    strategyConfig: STRATEGY_CONFIG,
    marketContext: null,
    candidatePool: [],
    ruleEngineResult: null,
    llmDecisionHistory: [],
    riskReviewHistory: [],
    portfolioDecisionHistory: [],
    executionLog: [],
    positionSnapshots: [],
    userCommunications: [],
    dataLineage: [],
    exceptionsAndFallbacks: [],
    reportExports: []
  };
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function mergeAuditDay(existing, tradingDate) {
  return {
    ...createAuditDay(tradingDate),
    ...(existing || {}),
    strategyConfig: {
      ...STRATEGY_CONFIG,
      ...((existing || {}).strategyConfig || {})
    }
  };
}

function pushAll(target, items = []) {
  for (const item of items) {
    target.push(createRecordedEntry(item));
  }
}

function buildControlExecutionLog({ action, status, messageSummary }) {
  return {
    type: 'control_action',
    action,
    status,
    messageSummary
  };
}

export function createAuditStore({ workspaceRoot }) {
  const auditDir = path.join(workspaceRoot, 'data', 'overnight-holding', 'audit');

  function resolveAuditPath(tradingDate) {
    return path.join(auditDir, `${tradingDate}.json`);
  }

  async function loadAuditDay(tradingDate) {
    return mergeAuditDay(await readJson(resolveAuditPath(tradingDate), null), tradingDate);
  }

  async function saveAuditDay(tradingDate, value) {
    await writeJson(resolveAuditPath(tradingDate), mergeAuditDay(value, tradingDate));
  }

  async function listAuditDays() {
    await mkdir(auditDir, { recursive: true });
    const files = await readdir(auditDir);
    return files
      .filter((item) => item.endsWith('.json'))
      .map((item) => item.replace(/\.json$/, ''))
      .sort();
  }

  async function recordSharedSections(auditDay, payload, phase) {
    if (payload.marketContext) {
      auditDay.marketContext = createRecordedEntry({
        phase,
        ...payload.marketContext
      });
    }

    if (Array.isArray(payload.candidatePool) && payload.candidatePool.length > 0) {
      auditDay.candidatePool = payload.candidatePool.map((item) => createRecordedEntry({
        phase,
        ...item
      }));
    }

    if (payload.ruleEngineResult) {
      auditDay.ruleEngineResult = createRecordedEntry({
        phase,
        ...payload.ruleEngineResult
      });
    }

    if (payload.llmDecisionJson) {
      auditDay.llmDecisionHistory.push(createRecordedEntry({
        phase,
        ...payload.llmDecisionJson
      }));
    }

    if (payload.riskReview) {
      auditDay.riskReviewHistory.push(createRecordedEntry({
        phase,
        ...payload.riskReview
      }));
    }

    if (payload.portfolioDecision) {
      auditDay.portfolioDecisionHistory.push(createRecordedEntry({
        phase,
        ...payload.portfolioDecision
      }));
    }

    if (payload.positionSnapshots) {
      auditDay.positionSnapshots.push(createRecordedEntry({
        phase,
        ...payload.positionSnapshots
      }));
    }

    if (payload.dataLineage) {
      auditDay.dataLineage.push(createRecordedEntry({
        phase,
        ...payload.dataLineage
      }));
    }

    pushAll(auditDay.exceptionsAndFallbacks, (payload.exceptionsAndFallbacks || []).map((item) => ({
      phase,
      ...item
    })));
    pushAll(auditDay.userCommunications, (payload.userCommunications || []).map((item) => ({
      phase,
      ...item
    })));
    pushAll(auditDay.executionLog, (payload.executionLog || []).map((item) => ({
      phase,
      ...item
    })));
  }

  return {
    loadAuditDay,
    saveAuditDay,
    listAuditDays,

    async recordSelectionAudit(payload) {
      const auditDay = await loadAuditDay(payload.tradingDate);
      await recordSharedSections(auditDay, payload, 'selection');
      await saveAuditDay(payload.tradingDate, auditDay);
      return auditDay;
    },

    async recordSellReviewAudit(payload) {
      const auditDay = await loadAuditDay(payload.tradingDate);
      await recordSharedSections(auditDay, payload, 'sell-review');
      await saveAuditDay(payload.tradingDate, auditDay);
      return auditDay;
    },

    async recordControlAudit(payload) {
      const auditDay = await loadAuditDay(payload.tradingDate);
      pushAll(auditDay.executionLog, [buildControlExecutionLog(payload)]);
      pushAll(auditDay.userCommunications, (payload.userCommunications || []).map((item) => ({
        phase: 'control',
        ...item
      })));
      if (payload.status) {
        auditDay.positionSnapshots.push(createRecordedEntry({
          phase: 'control',
          status: payload.status
        }));
      }
      if (payload.llmDecisionJson) {
        auditDay.llmDecisionHistory.push(createRecordedEntry({
          phase: 'control',
          ...payload.llmDecisionJson
        }));
      }
      await saveAuditDay(payload.tradingDate, auditDay);
      return auditDay;
    },

    async appendReportExport(tradingDate, reportExport) {
      const auditDay = await loadAuditDay(tradingDate);
      auditDay.reportExports.push(createRecordedEntry(reportExport));
      await saveAuditDay(tradingDate, auditDay);
      return auditDay;
    }
  };
}
