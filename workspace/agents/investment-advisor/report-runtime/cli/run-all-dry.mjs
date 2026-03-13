import { pathToFileURL } from 'node:url';

import { loadWorkspaceEnv } from '../lib/load-env.mjs';
import { runReport } from './run-report.mjs';

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

export async function runAllDry({ tradingDate = '2026-03-11', mode = 'manual' } = {}) {
  return Promise.all([
    runReport({ reportType: 'closing', tradingDate, mode, dryRun: true, publish: false, sourceMode: 'fixtures' }),
    runReport({ reportType: 'morning', tradingDate, mode, dryRun: true, publish: false, sourceMode: 'fixtures' }),
    runReport({ reportType: 'news', slot: `${tradingDate}-am`, mode, dryRun: true, publish: false, sourceMode: 'fixtures' })
  ]);
}

async function main() {
  try {
    await loadWorkspaceEnv();
    const args = parseArgs(process.argv.slice(2));
    const results = await runAllDry({
      tradingDate: args.tradingDate || '2026-03-11',
      mode: args.mode || 'manual'
    });
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
