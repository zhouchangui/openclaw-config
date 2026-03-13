import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAuditReport } from '../lib/audit-report.mjs';
import { parseCliArgs, printJson } from '../lib/io.mjs';

function resolveDefaultWorkspaceRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

const args = parseCliArgs();
const reportType = args.reportType || args.action || 'daily-report';
const workspaceRoot = args.workspaceRoot || resolveDefaultWorkspaceRoot();

const result = await buildAuditReport({
  workspaceRoot,
  reportType,
  tradingDate: args.tradingDate,
  fromDate: args.fromDate,
  toDate: args.toDate
});

printJson(result);
