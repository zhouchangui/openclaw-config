import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = path.join(workspaceRoot, '.env');
const envLocalPath = path.join(workspaceRoot, '.env.local');
const tempRoot = await mkdtemp(path.join(tmpdir(), 'report-env-loading-'));

async function readIfExists(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function restoreFile(filePath, content) {
  if (content === null) {
    await rm(filePath, { force: true });
    return;
  }
  await writeFile(filePath, content);
}

function buildCleanEnv(overrides = {}) {
  const nextEnv = { ...process.env, ...overrides };
  for (const key of [
    'REPORT_SKILL_SCRIPT_PATH',
    'AGENT_TOKEN',
    'PLATFORM_BASE_URL'
  ]) {
    if (!(key in overrides)) {
      delete nextEnv[key];
    }
  }
  return nextEnv;
}

async function runCli(env = {}) {
  const { stdout } = await execFile(
    'node',
    [
      'report-runtime/cli/run-report.mjs',
      '--reportType',
      'closing',
      '--tradingDate',
      '2026-03-11',
      '--mode',
      'scheduled',
      '--dryRun',
      'false',
      '--publish',
      'true'
    ],
    {
      cwd: workspaceRoot,
      env: buildCleanEnv(env)
    }
  );
  return JSON.parse(stdout);
}

const originalEnv = await readIfExists(envPath);
const originalEnvLocal = await readIfExists(envLocalPath);
const envScriptPath = path.join(tempRoot, 'env-report-skill.mjs');
const localScriptPath = path.join(tempRoot, 'local-report-skill.mjs');
const processScriptPath = path.join(tempRoot, 'process-report-skill.mjs');

for (const [scriptPath, suffix] of [
  [envScriptPath, 'env'],
  [localScriptPath, 'local'],
  [processScriptPath, 'process']
]) {
  await writeFile(
    scriptPath,
    `const [command] = process.argv.slice(2);
if (command !== 'publish') {
  process.stderr.write(JSON.stringify({ status: 'error', message: 'unsupported command' }) + '\\n');
  process.exit(1);
}
process.stdout.write(JSON.stringify({
  success: true,
  reportId: 'report-from-${suffix}',
  url: 'https://ddm.example.test/${suffix}'
}) + '\\n');
`
  );
}

try {
  await writeFile(envPath, `REPORT_SKILL_SCRIPT_PATH=${envScriptPath}\nAGENT_TOKEN=from-env\n`);
  await writeFile(envLocalPath, `REPORT_SKILL_SCRIPT_PATH=${localScriptPath}\nAGENT_TOKEN=from-local\n`);

  const fromLocal = await runCli();
  assert.equal(fromLocal.url, 'https://ddm.example.test/local');

  const fromProcess = await runCli({
    REPORT_SKILL_SCRIPT_PATH: processScriptPath,
    AGENT_TOKEN: 'from-process'
  });
  assert.equal(fromProcess.url, 'https://ddm.example.test/process');

  console.log('env-loading smoke ok');
} finally {
  await restoreFile(envPath, originalEnv);
  await restoreFile(envLocalPath, originalEnvLocal);
  await rm(tempRoot, { recursive: true, force: true });
}
