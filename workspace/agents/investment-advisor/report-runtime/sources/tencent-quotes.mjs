import { pathToFileURL } from 'node:url';

const DEFAULT_SYMBOLS = ['sh000001', 'sz399001', 'sz399006'];
const INDEX_NAME_BY_SYMBOL = {
  sh000001: '上证指数',
  sz399001: '深证成指',
  sz399006: '创业板指'
};

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeQuote(rawQuote) {
  const issues = [];
  const quote = {
    symbol: rawQuote.symbol || rawQuote.code || null,
    name: rawQuote.name || null,
    last: toNumber(rawQuote.last),
    previousClose: toNumber(rawQuote.previousClose),
    open: toNumber(rawQuote.open),
    high: toNumber(rawQuote.high),
    low: toNumber(rawQuote.low),
    change: toNumber(rawQuote.change),
    pctChange: toNumber(rawQuote.pctChange),
    volume: toNumber(rawQuote.volume),
    turnover: toNumber(rawQuote.turnover)
  };

  if (!quote.symbol) {
    issues.push('quote.symbol is missing');
  }

  if (!quote.name) {
    issues.push(`quote ${quote.symbol ?? 'unknown'} is missing name`);
  }

  if (
    quote.symbol &&
    (!quote.name || /�/.test(quote.name) || quote.name.includes('��'))
  ) {
    quote.name = INDEX_NAME_BY_SYMBOL[quote.symbol] || quote.name;
  }

  if (quote.last === null) {
    issues.push(`quote ${quote.symbol ?? 'unknown'} is missing last price`);
  }

  if (quote.change === null && quote.last !== null && quote.previousClose !== null) {
    quote.change = round(quote.last - quote.previousClose);
  }

  if (quote.pctChange === null && quote.change !== null && quote.previousClose) {
    quote.pctChange = round((quote.change / quote.previousClose) * 100);
  }

  if (quote.pctChange === null) {
    issues.push(`quote ${quote.symbol ?? 'unknown'} is missing pctChange`);
  }

  return {
    quote,
    issues
  };
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function parseTencentQuoteLine(line) {
  const match = line.match(/^v_([^=]+)="([^"]*)";?$/);
  if (!match) {
    return null;
  }

  const [, symbol, payload] = match;
  const fields = payload.split('~');

  return {
    symbol,
    name: fields[1],
    last: fields[3],
    previousClose: fields[4],
    open: fields[5],
    volume: fields[6],
    change: fields[31],
    pctChange: fields[32],
    high: fields[33],
    low: fields[34],
    turnover: fields[37]
  };
}

export function parseTencentQuotesPayload(payload, { fetchedAt = null } = {}) {
  const rawQuotes = typeof payload === 'string'
    ? payload
        .split(';')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => parseTencentQuoteLine(`${line};`))
        .filter(Boolean)
    : payload?.quotes || [];

  const issues = [];
  const indices = rawQuotes.map((rawQuote) => {
    const normalized = normalizeQuote(rawQuote);
    issues.push(...normalized.issues);
    return normalized.quote;
  });

  return {
    source: 'tencent-quotes',
    fetchedAt: fetchedAt || payload?.fetchedAt || null,
    status: issues.length === 0 ? 'ok' : 'partial',
    issues,
    indices,
    bySymbol: Object.fromEntries(indices.filter((item) => item.symbol).map((item) => [item.symbol, item]))
  };
}

export async function fetchTencentQuotes({
  symbols = DEFAULT_SYMBOLS,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required for live Tencent quote requests.');
  }

  const response = await fetchImpl(`https://qt.gtimg.cn/q=${symbols.join(',')}`);
  if (!response.ok) {
    throw new Error(`Tencent quotes request failed: ${response.status}`);
  }

  return parseTencentQuotesPayload(await response.text(), {
    fetchedAt: new Date().toISOString()
  });
}

async function runCli() {
  const symbols = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const result = await fetchTencentQuotes({
    symbols: symbols.length > 0 ? symbols : DEFAULT_SYMBOLS
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--live')) {
    await runCli();
  }
}
