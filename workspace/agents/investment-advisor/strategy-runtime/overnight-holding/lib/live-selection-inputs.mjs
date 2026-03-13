import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const DEFAULT_SELECTION_SYMBOLS = ['300750', '002594', '601991', '600121', '600519'];

function resolveRuntimeRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function summarizeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function resolveSelectionSymbols() {
  const configured = String(process.env.INVESTMENT_SELECTION_SYMBOLS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_SELECTION_SYMBOLS;
}

function validateProviderPayload(payload, provider) {
  const marketSnapshot = payload?.marketSnapshot;
  const candidateSnapshot = payload?.candidateSnapshot;
  if (!marketSnapshot || typeof marketSnapshot !== 'object') {
    throw new Error(`${provider} returned no market snapshot`);
  }
  if (!candidateSnapshot || !Array.isArray(candidateSnapshot.candidates) || candidateSnapshot.candidates.length === 0) {
    throw new Error(`${provider} returned empty candidates`);
  }
  return { marketSnapshot, candidateSnapshot };
}

async function loadProviderFixture(filePath, provider) {
  return {
    provider,
    ...validateProviderPayload(await readJson(filePath), provider)
  };
}

async function loadProviderFromPython({ provider, tradingDate, symbols }) {
  const pythonBin = process.env.INVESTMENT_SELECTION_PYTHON || 'python3';
  const scriptPath = path.join(resolveRuntimeRoot(), 'python', 'build_live_selection_inputs.py');
  const timeoutMs = Number(process.env.INVESTMENT_SELECTION_PROVIDER_TIMEOUT_MS || 120000);
  const { stdout } = await execFile(
    pythonBin,
    [
      scriptPath,
      '--provider', provider,
      '--trading-date', tradingDate,
      '--symbols', symbols.join(',')
    ],
    {
      env: process.env,
      timeout: Number.isFinite(timeoutMs) ? timeoutMs : 120000
    }
  );
  return {
    provider,
    ...validateProviderPayload(JSON.parse(stdout), provider)
  };
}

async function fetchProviderSelectionInputs({ provider, tradingDate, symbols }) {
  const fixtureEnvName = provider === 'tushare'
    ? 'INVESTMENT_SELECTION_TUSHARE_FIXTURE_FILE'
    : 'INVESTMENT_SELECTION_AKSHARE_FIXTURE_FILE';
  const fixtureFile = process.env[fixtureEnvName];
  if (fixtureFile) {
    return loadProviderFixture(fixtureFile, provider);
  }
  return loadProviderFromPython({ provider, tradingDate, symbols });
}

export async function resolveSelectionInputs({
  tradingDate,
  dryRun = false,
  marketFile,
  candidatesFile
}) {
  if (dryRun) {
    return {
      marketSnapshot: await readJson(marketFile),
      candidateSnapshot: await readJson(candidatesFile),
      dataSourceMode: 'fixtures',
      inputDataSource: {
        provider: 'files',
        mode: 'fixtures'
      },
      dataLineage: {
        marketFile,
        candidatesFile,
        inputProvider: 'files',
        inputMode: 'fixtures'
      },
      exceptionsAndFallbacks: []
    };
  }

  if (marketFile && candidatesFile) {
    return {
      marketSnapshot: await readJson(marketFile),
      candidateSnapshot: await readJson(candidatesFile),
      dataSourceMode: 'external-files',
      inputDataSource: {
        provider: 'files',
        mode: 'external-files'
      },
      dataLineage: {
        marketFile,
        candidatesFile,
        inputProvider: 'files',
        inputMode: 'external-files'
      },
      exceptionsAndFallbacks: []
    };
  }

  const symbols = resolveSelectionSymbols();
  const attempts = [];
  for (const provider of ['tushare', 'akshare']) {
    try {
      const resolved = await fetchProviderSelectionInputs({ provider, tradingDate, symbols });
      const fallbackFrom = attempts.length > 0 ? attempts.at(-1).provider : null;
      return {
        ...resolved,
        dataSourceMode: 'live-provider',
        inputDataSource: {
          provider,
          mode: 'live-provider',
          fallbackFrom,
          symbols
        },
        dataLineage: {
          marketFile: null,
          candidatesFile: null,
          inputProvider: provider,
          inputMode: 'live-provider',
          fallbackFrom,
          selectionSymbols: symbols,
          providerAttempts: attempts
        },
        exceptionsAndFallbacks: fallbackFrom
          ? [{
            type: 'selection_input_provider_fallback',
            from: fallbackFrom,
            to: provider,
            reason: attempts.at(-1).reason
          }]
          : []
      };
    } catch (error) {
      attempts.push({
        provider,
        reason: summarizeError(error)
      });
    }
  }

  throw new Error(
    `Selection live providers failed: ${attempts.map((item) => `${item.provider}: ${item.reason}`).join('; ')}`
  );
}
