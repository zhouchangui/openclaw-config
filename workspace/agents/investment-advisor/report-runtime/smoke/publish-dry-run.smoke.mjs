import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function runCli(args, env = {}) {
  return execFile('node', args, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      ...env
    }
  });
}

const tempRoot = await mkdtemp(path.join(tmpdir(), 'report-skill-publish-smoke-'));
const stubLogPath = path.join(tempRoot, 'report-skill.log');
const stubScriptPath = path.join(tempRoot, 'report-skill-stub.mjs');

await writeFile(
  stubScriptPath,
  `import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const [command, rawInput = '{}'] = process.argv.slice(2);
const input = JSON.parse(rawInput);
const logPath = process.env.REPORT_STUB_LOG_PATH;

if (logPath) {
  await mkdir(path.dirname(logPath), { recursive: true });
  await appendFile(logPath, JSON.stringify({ command, input }) + '\\n');
}

if (process.env.REPORT_STUB_FAIL === '1') {
  process.stderr.write(JSON.stringify({ status: 'error', message: 'stub publish failed' }) + '\\n');
  process.exit(1);
}

if (command === 'publish') {
  process.stdout.write(JSON.stringify({
    success: true,
    reportId: 'ddm-report-2026-03-11',
    url: 'https://ddm.example.test/reports/ddm-report-2026-03-11'
  }) + '\\n');
  process.exit(0);
}

if (command === 'resolve-template-path') {
  process.stdout.write(JSON.stringify({
    success: true,
    template: input.template,
    templatePath: input.template
  }) + '\\n');
  process.exit(0);
}

process.stderr.write(JSON.stringify({ status: 'error', message: 'unsupported command' }) + '\\n');
process.exit(1);
`
);

const dryRunResult = JSON.parse((await runCli([
  'report-runtime/cli/run-report.mjs',
  '--reportType', 'closing',
  '--tradingDate', '2026-03-11',
  '--mode', 'scheduled',
  '--dryRun', 'true',
  '--publish', 'true'
], {
  REPORT_SKILL_SCRIPT_PATH: stubScriptPath,
  REPORT_STUB_LOG_PATH: stubLogPath
})).stdout);

assert.equal(dryRunResult.ok, true);
assert.equal(dryRunResult.publish, true);
assert.equal(dryRunResult.dryRun, true);
assert.equal(dryRunResult.status, 'ready');
assert.ok(typeof dryRunResult.publishResultPath === 'string' && dryRunResult.publishResultPath.endsWith('.publish-result.json'));
assert.equal(dryRunResult.url, 'dry-run://ddm/closing/2026-03-11');

const dryRunPublishResult = JSON.parse(await readFile(dryRunResult.publishResultPath, 'utf8'));
assert.equal(dryRunPublishResult.platform, 'ddm');
assert.equal(dryRunPublishResult.reportId, 'dry-run:closing:2026-03-11');
assert.equal(dryRunPublishResult.url, 'dry-run://ddm/closing/2026-03-11');

let dryRunLogExists = true;
try {
  await stat(stubLogPath);
} catch (error) {
  if (error && error.code === 'ENOENT') {
    dryRunLogExists = false;
  } else {
    throw error;
  }
}
assert.equal(dryRunLogExists, false);

const publishedResult = JSON.parse((await runCli([
  'report-runtime/cli/run-report.mjs',
  '--reportType', 'closing',
  '--tradingDate', '2026-03-11',
  '--mode', 'scheduled',
  '--dryRun', 'false',
  '--publish', 'true'
], {
  AGENT_TOKEN: 'fake-agent-token',
  REPORT_SKILL_SCRIPT_PATH: stubScriptPath,
  REPORT_STUB_LOG_PATH: stubLogPath
})).stdout);

assert.equal(publishedResult.ok, true);
assert.equal(publishedResult.publish, true);
assert.equal(publishedResult.dryRun, false);
assert.equal(publishedResult.status, 'published');
assert.equal(publishedResult.url, 'https://ddm.example.test/reports/ddm-report-2026-03-11');

const publishResultFile = JSON.parse(await readFile(publishedResult.publishResultPath, 'utf8'));
assert.equal(publishResultFile.platform, 'ddm');
assert.equal(publishResultFile.reportId, 'ddm-report-2026-03-11');
assert.equal(publishResultFile.url, 'https://ddm.example.test/reports/ddm-report-2026-03-11');
assert.deepEqual(publishResultFile.issues, []);

const logLines = (await readFile(stubLogPath, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
assert.equal(logLines.length, 1);
assert.equal(logLines[0].command, 'publish');
assert.ok(path.isAbsolute(logLines[0].input.templatePath));
assert.match(logLines[0].input.templatePath, /report-templates\/closing-market-report$/);
assert.equal(logLines[0].input.title, 'A股收盘报告｜2026-03-11');
assert.equal(logLines[0].input.summary, '今天A股整体呈现成长领先，创业板指+1.31%，主线集中在逆变器，而钨明显承压。');
assert.equal(logLines[0].input.reportData.reportType, 'closing');

let publishError = '';
try {
  await runCli([
    'report-runtime/cli/run-report.mjs',
    '--reportType', 'closing',
    '--tradingDate', '2026-03-11',
    '--mode', 'scheduled',
    '--dryRun', 'false',
    '--publish', 'true'
  ], {
    AGENT_TOKEN: 'fake-agent-token',
    REPORT_SKILL_SCRIPT_PATH: stubScriptPath,
    REPORT_STUB_FAIL: '1'
  });
} catch (error) {
  publishError = `${error.stderr || error.message}`;
}

assert.match(publishError, /stub publish failed/);
await rm(tempRoot, { recursive: true, force: true });
console.log('publish-dry-run smoke ok');
