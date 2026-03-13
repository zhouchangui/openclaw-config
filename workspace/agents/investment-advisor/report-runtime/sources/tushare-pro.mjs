import { execFile as execFileCallback } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import { readJsonFile } from '../lib/io.mjs';

const execFile = promisify(execFileCallback);
const scriptPath = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  'python',
  'tushare_market_report.py'
);

async function readFixture(envName) {
  const fixturePath = process.env[envName];
  if (!fixturePath) return null;
  return readJsonFile(fixturePath);
}

async function runTushareScript({ dataset, tradingDate, lookback = 30 }) {
  const pythonBin = process.env.INVESTMENT_TUSHARE_PYTHON || 'python3';
  const args = [scriptPath, '--dataset', dataset];
  if (tradingDate) {
    args.push('--trading-date', tradingDate);
  }
  if (lookback) {
    args.push('--lookback', String(lookback));
  }

  const { stdout } = await execFile(pythonBin, args, {
    maxBuffer: 10 * 1024 * 1024,
    env: process.env
  });

  return JSON.parse(stdout);
}

export async function fetchTushareMorningBrief({ tradingDate } = {}) {
  const fixture = await readFixture('INVESTMENT_TUSHARE_MORNING_FIXTURE_FILE');
  if (fixture) {
    return fixture;
  }
  return runTushareScript({ dataset: 'morning', tradingDate });
}

export async function fetchTushareIndexQuotes({ tradingDate } = {}) {
  const fixture = await readFixture('INVESTMENT_TUSHARE_QUOTES_FIXTURE_FILE');
  if (fixture) {
    return fixture;
  }
  return runTushareScript({ dataset: 'quotes', tradingDate });
}

export async function fetchTushareIndexKline({ tradingDate, lookback = 30 } = {}) {
  const fixture = await readFixture('INVESTMENT_TUSHARE_KLINE_FIXTURE_FILE');
  if (fixture) {
    return fixture;
  }
  return runTushareScript({ dataset: 'kline', tradingDate, lookback });
}
