import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runtimeRoot = path.join(workspaceRoot, 'report-runtime');

async function runCli(args, env) {
  const { stdout } = await execFile('node', args, {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      ...env
    }
  });
  return JSON.parse(stdout);
}

const env = {
  INVESTMENT_TUSHARE_MORNING_FIXTURE_FILE: path.join(runtimeRoot, 'fixtures', 'tushare-morning-brief.sample.json'),
  INVESTMENT_TUSHARE_QUOTES_FIXTURE_FILE: path.join(runtimeRoot, 'fixtures', 'tushare-index-quotes.sample.json'),
  INVESTMENT_TUSHARE_KLINE_FIXTURE_FILE: path.join(runtimeRoot, 'fixtures', 'tushare-index-kline.sample.json'),
  INVESTMENT_AKSHARE_NEWS_FIXTURE_FILE: path.join(runtimeRoot, 'fixtures', 'news-brief.akshare.sample.json'),
  INVESTMENT_NEWS_FEED_FIXTURE_FILE: path.join(runtimeRoot, 'fixtures', 'news-feed.sample.html')
};

const morning = await runCli([
  'report-runtime/cli/run-report.mjs',
  '--reportType', 'morning',
  '--tradingDate', '2026-03-11',
  '--mode', 'scheduled',
  '--dryRun', 'true',
  '--publish', 'false'
], env);

const closing = await runCli([
  'report-runtime/cli/run-report.mjs',
  '--reportType', 'closing',
  '--tradingDate', '2026-03-11',
  '--mode', 'scheduled',
  '--dryRun', 'true',
  '--publish', 'false'
], env);

const news = await runCli([
  'report-runtime/cli/run-report.mjs',
  '--reportType', 'news',
  '--slot', '2026-03-11-am',
  '--mode', 'scheduled',
  '--dryRun', 'true',
  '--publish', 'false'
], env);

const morningData = JSON.parse(await readFile(morning.dataPath, 'utf8'));
const closingData = JSON.parse(await readFile(closing.dataPath, 'utf8'));
const newsData = JSON.parse(await readFile(news.dataPath, 'utf8'));

assert.equal(morningData.sources[0]?.name, 'tushare-pro');
assert.ok(closingData.sources.some((item) => item.name === 'tushare-pro-quotes'));
assert.ok(closingData.sources.some((item) => item.name === 'tushare-pro-kline'));
assert.equal(newsData.sources[0]?.name, 'akshare-news');

assert.ok(morningData.meta.sourceLabel.includes('Tushare'));
assert.ok(closingData.meta.sourceLabel.includes('Tushare'));
assert.ok(newsData.meta.sourceLabel.includes('Akshare'));

console.log('live-defaults smoke ok');
