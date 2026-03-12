import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_BY_REPORT_TYPE = {
  morning: 'morning-market-report',
  closing: 'closing-market-report',
  news: 'news-market-report'
};

export function resolveWorkspaceRoot(fromMetaUrl = import.meta.url) {
  return path.resolve(path.dirname(fileURLToPath(fromMetaUrl)), '../..');
}

export function resolveWorkspacePaths(workspaceRoot = resolveWorkspaceRoot()) {
  return {
    workspaceRoot,
    dataDir: path.join(workspaceRoot, 'data'),
    reportsDir: path.join(workspaceRoot, 'reports'),
    reportTemplatesDir: path.join(workspaceRoot, 'report-templates'),
    reportRuntimeDir: path.join(workspaceRoot, 'report-runtime')
  };
}

export function resolveReportKey({ tradingDate, slot }) {
  if (slot) {
    return slot;
  }

  if (tradingDate) {
    return tradingDate;
  }

  throw new Error('Either tradingDate or slot is required to resolve report paths.');
}

export function resolveTemplateDir({
  workspaceRoot = resolveWorkspaceRoot(),
  reportType
}) {
  const templateName = TEMPLATE_BY_REPORT_TYPE[reportType];

  if (!templateName) {
    throw new Error(`Unsupported report type: ${reportType}`);
  }

  return path.join(workspaceRoot, 'report-templates', templateName);
}

export function resolveReportArtifacts({
  workspaceRoot = resolveWorkspaceRoot(),
  reportType,
  tradingDate,
  slot
}) {
  if (!reportType) {
    throw new Error('reportType is required.');
  }

  const key = resolveReportKey({ tradingDate, slot });
  const dataDir = path.join(workspaceRoot, 'data', reportType);
  const reportsDir = path.join(workspaceRoot, 'reports', reportType);

  return {
    key,
    reportType,
    dataPath: path.join(dataDir, `${key}.json`),
    markdownPath: path.join(reportsDir, `${key}.md`),
    htmlPath: path.join(reportsDir, `${key}.html`),
    publishResultPath: path.join(reportsDir, `${key}.publish-result.json`)
  };
}
