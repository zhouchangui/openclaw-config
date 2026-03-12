const DEFAULT_SYMBOLS = ['sh000001', 'sz399001', 'sz399006'];

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function symbolToSecId(symbol) {
  if (symbol.startsWith('sh')) {
    return `1.${symbol.slice(2)}`;
  }

  if (symbol.startsWith('sz')) {
    return `0.${symbol.slice(2)}`;
  }

  throw new Error(`Unsupported symbol: ${symbol}`);
}

function normalizePoint(rawPoint) {
  return {
    tradeDate: rawPoint.tradeDate,
    open: toNumber(rawPoint.open),
    high: toNumber(rawPoint.high),
    low: toNumber(rawPoint.low),
    close: toNumber(rawPoint.close),
    volume: toNumber(rawPoint.volume),
    amount: toNumber(rawPoint.amount)
  };
}

function parseEastmoneyResponseSeries(payload) {
  const symbol = payload?.data?.code;
  const name = payload?.data?.name;
  const klines = Array.isArray(payload?.data?.klines) ? payload.data.klines : [];

  return {
    symbol,
    name,
    points: klines
      .map((entry) => entry.split(','))
      .map((fields) => normalizePoint({
        tradeDate: fields[0],
        open: fields[1],
        close: fields[2],
        high: fields[3],
        low: fields[4],
        volume: fields[5],
        amount: fields[6]
      }))
  };
}

export function parseEastmoneyKlinePayload(payload, { fetchedAt = null } = {}) {
  const issues = [];
  const rawSeries = Array.isArray(payload?.series)
    ? payload.series
    : payload?.data?.klines
      ? [parseEastmoneyResponseSeries(payload)]
      : [];

  const series = rawSeries
    .map((rawItem) => ({
      symbol: rawItem.symbol,
      name: rawItem.name,
      points: (rawItem.points || []).map(normalizePoint)
    }))
    .filter((item) => item.symbol && item.name && item.points.length > 0);

  if (series.length === 0) {
    issues.push('kline series is empty');
  }

  series.forEach((item) => {
    if (item.points.some((point) => Object.values(point).some((value) => value === null))) {
      issues.push(`${item.symbol} contains incomplete kline points`);
    }
  });

  return {
    source: 'eastmoney-kline',
    fetchedAt: fetchedAt || payload?.fetchedAt || null,
    status: issues.length === 0 ? 'ok' : 'partial',
    issues,
    series
  };
}

export async function fetchEastmoneyKline({
  symbols = DEFAULT_SYMBOLS,
  limit = 60,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required for live Eastmoney kline requests.');
  }

  const rawSeries = await Promise.all(
    symbols.map(async (symbol) => {
      const secId = symbolToSecId(symbol);
      const url =
        `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secId}` +
        `&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=1&end=20500101&lmt=${limit}`;

      const response = await fetchImpl(url);
      if (!response.ok) {
        throw new Error(`Eastmoney kline request failed for ${symbol}: ${response.status}`);
      }

      return parseEastmoneyResponseSeries(await response.json());
    })
  );

  return parseEastmoneyKlinePayload(
    {
      fetchedAt: new Date().toISOString(),
      series: rawSeries
    },
    {
      fetchedAt: new Date().toISOString()
    }
  );
}
