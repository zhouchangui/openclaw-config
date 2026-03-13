import { execFile as execFileCallback } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

function stripCodeFence(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

function parseDecisionText(text) {
  const normalized = stripCodeFence(text);
  try {
    return JSON.parse(normalized);
  } catch {
    const start = normalized.indexOf('{');
    const end = normalized.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(normalized.slice(start, end + 1));
    }
    throw new Error('Agent response is not valid JSON');
  }
}

async function readFixtureDecision(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function buildSelectionPrompt({ tradingDate, marketContext, portfolioDecision, candidatePool }) {
  return [
    '你是隔日持股研究助手。',
    '禁止调用任何工具，禁止访问外部数据，禁止解释过程。',
    '你只能根据我提供的 JSON 做 buy / no_buy 决策。',
    '只返回一个 JSON 对象，不要 markdown，不要代码块。',
    'JSON 必须包含字段：action, buyList, rejectedCandidates, principlesCited, riskFlags, confidence, decisionMode。',
    '其中 buyList 每项必须包含：symbol, name, weightPct, reason。',
    '其中 rejectedCandidates 每项必须包含：symbol, reason。',
    'decisionMode 固定填写 agent。',
    `交易日：${tradingDate}`,
    `输入数据：${JSON.stringify({ marketContext, portfolioDecision, candidatePool })}`
  ].join('\n');
}

function buildSellReviewPrompt({ tradingDate, checkpointAt, openPositions, snapshots }) {
  return [
    '你是隔日持股卖出复盘助手。',
    '禁止调用任何工具，禁止访问外部数据，禁止解释过程。',
    '你只能根据我提供的 JSON 为每个持仓输出 sell_now / sell_on_first_push / hold_and_recheck 之一。',
    '只返回一个 JSON 对象，不要 markdown，不要代码块。',
    'JSON 必须包含字段：action, sellList, rejectedCandidates, principlesCited, riskFlags, confidence, decisionMode。',
    'sellList 每项必须包含：symbol, action, reason。',
    'decisionMode 固定填写 agent。',
    `交易日：${tradingDate}`,
    `检查点：${checkpointAt}`,
    `输入数据：${JSON.stringify({ openPositions, snapshots })}`
  ].join('\n');
}

async function callAgent(prompt) {
  const fixtureFile = process.env.OPENCLAW_AGENT_FIXTURE_FILE;
  if (fixtureFile) {
    return {
      decision: await readFixtureDecision(fixtureFile),
      source: 'agent',
      agentMeta: {
        sessionId: 'fixture-session',
        provider: 'fixture',
        model: 'fixture'
      }
    };
  }

  const { stdout } = await execFile('openclaw', [
    'agent',
    '--agent', 'investment-advisor',
    '--json',
    '--thinking', 'minimal',
    '--timeout', process.env.OPENCLAW_AGENT_TIMEOUT || '180',
    '--message', prompt
  ]);
  const outer = JSON.parse(stdout);
  const payloadText = outer?.result?.payloads?.find((item) => typeof item.text === 'string' && item.text.trim())?.text;
  if (!payloadText) {
    throw new Error('Agent returned no text payload');
  }

  return {
    decision: parseDecisionText(payloadText),
    source: 'agent',
    agentMeta: outer?.result?.meta?.agentMeta || null
  };
}

export async function resolveSelectionLlmDecision({
  tradingDate,
  dryRun,
  llmDecisionFile,
  marketContext,
  portfolioDecision,
  candidatePool,
  fallbackDecision
}) {
  if (llmDecisionFile) {
    return {
      decision: await readFixtureDecision(llmDecisionFile),
      source: 'file',
      agentMeta: null,
      fallbackError: null
    };
  }

  const shouldAttemptAgent = Boolean(process.env.OPENCLAW_AGENT_FIXTURE_FILE) || !dryRun;
  if (!shouldAttemptAgent) {
    return {
      decision: fallbackDecision,
      source: 'runtime_fallback',
      agentMeta: null,
      fallbackError: 'agent_skipped_in_dry_run'
    };
  }

  try {
    return {
      ...(await callAgent(buildSelectionPrompt({
        tradingDate,
        marketContext,
        portfolioDecision,
        candidatePool
      }))),
      fallbackError: null
    };
  } catch (error) {
    return {
      decision: fallbackDecision,
      source: 'runtime_fallback',
      agentMeta: null,
      fallbackError: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function resolveSellReviewLlmDecision({
  tradingDate,
  checkpointAt,
  dryRun,
  llmDecisionFile,
  openPositions,
  snapshots,
  fallbackDecision
}) {
  if (llmDecisionFile) {
    return {
      decision: await readFixtureDecision(llmDecisionFile),
      source: 'file',
      agentMeta: null,
      fallbackError: null
    };
  }

  const shouldAttemptAgent = Boolean(process.env.OPENCLAW_AGENT_FIXTURE_FILE) || !dryRun;
  if (!shouldAttemptAgent) {
    return {
      decision: fallbackDecision,
      source: 'runtime_fallback',
      agentMeta: null,
      fallbackError: 'agent_skipped_in_dry_run'
    };
  }

  try {
    return {
      ...(await callAgent(buildSellReviewPrompt({
        tradingDate,
        checkpointAt,
        openPositions,
        snapshots
      }))),
      fallbackError: null
    };
  } catch (error) {
    return {
      decision: fallbackDecision,
      source: 'runtime_fallback',
      agentMeta: null,
      fallbackError: error instanceof Error ? error.message : String(error)
    };
  }
}
