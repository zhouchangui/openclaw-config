import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = path.resolve(runtimeRoot, '..', '..');
const tempRoot = await mkdtemp(path.join(tmpdir(), 'overnight-selection-agent-'));

async function runCli(args) {
  const { stdout } = await execFile('node', args, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      OPENCLAW_AGENT_FIXTURE_FILE: path.join(runtimeRoot, 'fixtures', 'selection.agent-decision.sample.json')
    }
  });
  return JSON.parse(stdout);
}

try {
  const result = await runCli([
    'strategy-runtime/overnight-holding/cli/run-selection.mjs',
    '--tradingDate', '2026-03-12',
    '--variant', 'both',
    '--dryRun', 'false',
    '--workspaceRoot', tempRoot,
    '--marketFile', path.join(runtimeRoot, 'fixtures', 'market-regime.good.json'),
    '--candidatesFile', path.join(runtimeRoot, 'fixtures', 'candidates.sample.json')
  ]);

  assert.equal(result.ok, true);
  assert.equal(result.llmDecisionJson.decisionMode, 'agent');
  assert.equal(result.virtualBuys.length, 2);

  const auditDay = JSON.parse(
    await readFile(path.join(tempRoot, 'data', 'overnight-holding', 'audit', '2026-03-12.json'), 'utf8')
  );
  assert.equal(auditDay.llmDecisionHistory.at(-1).decisionMode, 'agent');
  assert.equal(
    auditDay.exceptionsAndFallbacks.some((item) => item.type === 'llm_decision_missing'),
    false
  );

  console.log('selection-agent-llm smoke ok');
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}
