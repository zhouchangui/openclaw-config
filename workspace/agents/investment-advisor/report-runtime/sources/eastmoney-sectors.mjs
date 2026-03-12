const DEFAULT_EASTMONEY_SECTOR_URL =
  'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=200&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:90+t:2&fields=f12,f14,f3,f128';

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSector(rawSector) {
  return {
    name: rawSector.name || rawSector.f14 || null,
    pctChange: toNumber(rawSector.pctChange ?? rawSector.f3),
    leadStock: rawSector.leadStock || rawSector.f128 || null,
    reason: rawSector.reason || null
  };
}

export function parseEastmoneySectorsPayload(payload, { fetchedAt = null } = {}) {
  const issues = [];
  const rawLeaders = Array.isArray(payload?.leaders)
    ? payload.leaders
    : Array.isArray(payload?.data?.diff)
      ? payload.data.diff
      : [];
  const rawLaggards = Array.isArray(payload?.laggards)
    ? payload.laggards
    : Array.isArray(payload?.data?.diff)
      ? payload.data.diff
      : [];

  const leaders = rawLeaders
    .map(normalizeSector)
    .filter((item) => item.name && item.pctChange !== null)
    .sort((left, right) => right.pctChange - left.pctChange)
    .slice(0, 10);

  const laggards = rawLaggards
    .map(normalizeSector)
    .filter((item) => item.name && item.pctChange !== null)
    .sort((left, right) => left.pctChange - right.pctChange)
    .slice(0, 10);

  if (leaders.length === 0) {
    issues.push('leaders list is empty');
  }

  if (laggards.length === 0) {
    issues.push('laggards list is empty');
  }

  return {
    source: 'eastmoney-sectors',
    fetchedAt: fetchedAt || payload?.fetchedAt || null,
    status: issues.length === 0 ? 'ok' : 'partial',
    issues,
    leaders,
    laggards
  };
}

export async function fetchEastmoneySectors({
  url = DEFAULT_EASTMONEY_SECTOR_URL,
  fetchImpl = globalThis.fetch
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required for live Eastmoney sector requests.');
  }

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Eastmoney sector request failed: ${response.status}`);
  }

  return parseEastmoneySectorsPayload(await response.json(), {
    fetchedAt: new Date().toISOString()
  });
}
