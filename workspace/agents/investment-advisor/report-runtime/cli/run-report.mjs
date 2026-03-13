import { pathToFileURL } from 'node:url';

import { loadWorkspaceEnv } from '../lib/load-env.mjs';
import { runClosingReport } from '../reports/closing/run.mjs';
import { runMorningReport } from '../reports/morning/run.mjs';
import { runNewsReport } from '../reports/news/run.mjs';

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

export async function runReport(options) {
  const reportType = options.reportType;
  const mode = options.mode || 'manual';
  const dryRun = parseBoolean(options.dryRun, true);
  const publish = parseBoolean(options.publish, false);
  const sourceMode = options.sourceMode || 'live';

  if (reportType === 'closing') {
    return runClosingReport({
      tradingDate: options.tradingDate,
      mode,
      dryRun,
      publish,
      sourceMode,
      quotesFile: options.quotesFile,
      sectorsFile: options.sectorsFile,
      klineFile: options.klineFile,
      newsFile: options.newsFile
    });
  }

  if (reportType === 'morning') {
    return runMorningReport({
      tradingDate: options.tradingDate,
      mode,
      dryRun,
      publish,
      sourceMode,
      briefFile: options.briefFile
    });
  }

  if (reportType === 'news') {
    return runNewsReport({
      slot: options.slot || (options.tradingDate ? `${options.tradingDate}-am` : undefined),
      mode,
      dryRun,
      publish,
      sourceMode,
      briefFile: options.briefFile,
      asOf: options.asOf,
      windowHours: options.windowHours ? Number(options.windowHours) : 24
    });
  }

  throw new Error(`Unsupported reportType: ${reportType}`);
}

async function main() {
  try {
    await loadWorkspaceEnv();
    const args = parseArgs(process.argv.slice(2));
    const result = await runReport(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
