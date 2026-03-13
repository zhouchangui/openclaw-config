import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildSelectionPackage } from '../lib/build-selection-package.mjs';
import { parseBoolean, parseCliArgs, printJson } from '../lib/io.mjs';
import { validateSelectionInput } from '../lib/schema-checks.mjs';

function resolveDefaultWorkspaceRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

const args = parseCliArgs();
const input = {
  tradingDate: args.tradingDate,
  variant: args.variant || 'both',
  dryRun: parseBoolean(args.dryRun, false),
  workspaceRoot: args.workspaceRoot || resolveDefaultWorkspaceRoot(),
  marketFile: args.marketFile,
  candidatesFile: args.candidatesFile
};

const validation = validateSelectionInput(input);
if (!validation.ok) {
  printJson({ ok: false, phase: 'selection', issues: validation.issues });
  process.exitCode = 1;
} else {
  const result = await buildSelectionPackage(input);
  printJson({
    ...result,
    dryRun: input.dryRun
  });
}
