import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { applyTechnicalPrefilter } from './technical-prefilter.mjs';

const execFile = promisify(execFileCallback);

function resolveRuntimeRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function summarizeError(error) {
  return error instanceof Error ? error.message : String(error);
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
  const normalized = applyTechnicalPrefilter({
    candidateSnapshot,
    prefilterSummary: payload?.prefilterSummary,
    scope: 'full-market'
  });
  return {
    marketSnapshot,
    candidateSnapshot: normalized.candidateSnapshot,
    prefilterSummary: normalized.prefilterSummary,
    providerMeta: payload?.providerMeta || null,
    exceptionsAndFallbacks: Array.isArray(payload?.exceptionsAndFallbacks)
      ? payload.exceptionsAndFallbacks
      : []
  };
}

async function loadProviderFixture(filePath, provider) {
  return {
    provider,
    ...validateProviderPayload(await readJson(filePath), provider)
  };
}

async function loadProviderFromPython({ provider, tradingDate }) {
  const pythonBin = process.env.INVESTMENT_SELECTION_PYTHON || 'python3';
  const scriptPath = path.join(resolveRuntimeRoot(), 'python', 'build_live_selection_inputs.py');
  const timeoutMs = Number(process.env.INVESTMENT_SELECTION_PROVIDER_TIMEOUT_MS || 120000);
  const { stdout } = await execFile(
    pythonBin,
    [
      scriptPath,
      '--provider', provider,
      '--trading-date', tradingDate
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

async function fetchProviderSelectionInputs({ provider, tradingDate }) {
  const fixtureEnvName = {
    tushare: 'INVESTMENT_SELECTION_TUSHARE_FIXTURE_FILE',
    akshare: 'INVESTMENT_SELECTION_AKSHARE_FIXTURE_FILE',
    web: 'INVESTMENT_SELECTION_WEB_FIXTURE_FILE'
  }[provider];
  const fixtureFile = process.env[fixtureEnvName];
  if (fixtureFile) {
    return loadProviderFixture(fixtureFile, provider);
  }
  return loadProviderFromPython({ provider, tradingDate });
}

export async function resolveSelectionInputs({
  tradingDate,
  dryRun = false,
  marketFile,
  candidatesFile
}) {
  if (dryRun) {
    const normalized = applyTechnicalPrefilter({
      candidateSnapshot: await readJson(candidatesFile),
      scope: 'full-market'
    });
    return {
      marketSnapshot: await readJson(marketFile),
      candidateSnapshot: normalized.candidateSnapshot,
      prefilterSummary: normalized.prefilterSummary,
      dataSourceMode: 'fixtures',
      inputDataSource: {
        provider: 'files',
        mode: 'fixtures'
      },
      dataLineage: {
        marketFile,
        candidatesFile,
        inputProvider: 'files',
        inputMode: 'fixtures',
        selectionScope: normalized.prefilterSummary.scope,
        technicalCandidatesCount: normalized.prefilterSummary.technicalCandidatesCount,
        prefilterFilters: normalized.prefilterSummary.filters
      },
      exceptionsAndFallbacks: []
    };
  }

  if (marketFile && candidatesFile) {
    const normalized = applyTechnicalPrefilter({
      candidateSnapshot: await readJson(candidatesFile),
      scope: 'full-market'
    });
    return {
      marketSnapshot: await readJson(marketFile),
      candidateSnapshot: normalized.candidateSnapshot,
      prefilterSummary: normalized.prefilterSummary,
      dataSourceMode: 'external-files',
      inputDataSource: {
        provider: 'files',
        mode: 'external-files'
      },
      dataLineage: {
        marketFile,
        candidatesFile,
        inputProvider: 'files',
        inputMode: 'external-files',
        selectionScope: normalized.prefilterSummary.scope,
        technicalCandidatesCount: normalized.prefilterSummary.technicalCandidatesCount,
        prefilterFilters: normalized.prefilterSummary.filters
      },
      exceptionsAndFallbacks: []
    };
  }

  const attempts = [];
  for (const provider of ['tushare', 'akshare', 'web']) {
    try {
      const resolved = await fetchProviderSelectionInputs({ provider, tradingDate });
      const fallbackFrom = attempts.length > 0 ? attempts.at(-1).provider : null;
      const symbols = resolved.candidateSnapshot.candidates.map((candidate) => candidate.symbol);
      const exceptionsAndFallbacks = [
        ...(fallbackFrom
          ? [{
            type: 'selection_input_provider_fallback',
            from: fallbackFrom,
            to: provider,
            reason: attempts.at(-1).reason
          }]
          : []),
        ...((resolved.exceptionsAndFallbacks || []).map((item) => ({ ...item, provider })))
      ];
      return {
        ...resolved,
        dataSourceMode: 'live-provider',
        inputDataSource: {
          provider,
          mode: 'live-provider',
          fallbackFrom,
          scope: resolved.prefilterSummary?.scope || 'full-market',
          symbols
        },
        dataLineage: {
          marketFile: null,
          candidatesFile: null,
          inputProvider: provider,
          inputMode: 'live-provider',
          fallbackFrom,
          selectionScope: resolved.prefilterSummary?.scope || 'full-market',
          selectionSymbols: symbols,
          providerAttempts: attempts,
          technicalCandidatesCount: resolved.prefilterSummary?.technicalCandidatesCount ?? symbols.length,
          prefilterFilters: resolved.prefilterSummary?.filters || [],
          universeCount: resolved.prefilterSummary?.universeCount ?? symbols.length,
          providerMeta: resolved.providerMeta || null
        },
        exceptionsAndFallbacks
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
