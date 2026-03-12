function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function average(values) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calculateMovingAverageSeries(values, period) {
  return values.map((_, index) => {
    const slice = values.slice(Math.max(0, index - period + 1), index + 1);
    return round(average(slice));
  });
}

export function calculateEma(values, period) {
  const multiplier = 2 / (period + 1);
  let previous = Number(values[0] ?? 0);

  return values.map((rawValue, index) => {
    const value = Number(rawValue ?? 0);
    if (index === 0) {
      previous = value;
      return round(value);
    }

    previous = value * multiplier + previous * (1 - multiplier);
    return round(previous);
  });
}

export function calculateMacd(
  values,
  { shortPeriod = 12, longPeriod = 26, signalPeriod = 9 } = {}
) {
  const shortEma = calculateEma(values, shortPeriod);
  const longEma = calculateEma(values, longPeriod);
  const dif = values.map((_, index) => round(shortEma[index] - longEma[index]));

  let previousDea = dif[0] ?? 0;
  const dea = dif.map((value, index) => {
    if (index === 0) {
      previousDea = value;
      return round(value);
    }

    previousDea = value * (2 / (signalPeriod + 1)) + previousDea * (1 - 2 / (signalPeriod + 1));
    return round(previousDea);
  });

  const hist = dif.map((value, index) => round((value - dea[index]) * 2));
  return { dif, dea, hist };
}

function describeStructure(lastClose, ma5, ma10, ma20, macd) {
  const lastHist = macd.hist.at(-1) ?? 0;
  if (lastClose >= ma5 && ma5 >= ma10 && ma10 >= ma20 && lastHist >= 0) {
    return '强势修复';
  }

  if (lastClose >= ma5 && ma5 >= ma10 && lastHist >= 0) {
    return '震荡偏强';
  }

  if (lastClose >= ma10) {
    return '修复增强';
  }

  return '偏弱整理';
}

function describeMaStatus(lastClose, ma5, ma10, ma20) {
  if (lastClose >= ma5 && ma5 >= ma10 && ma10 >= ma20) {
    return '价格与短中期均线保持多头顺序';
  }

  if (lastClose >= ma5 && ma5 >= ma10) {
    return '价格站上短期均线，修复结构延续';
  }

  return '价格仍在均线附近反复确认';
}

function describeMacdStatus(macd) {
  const dif = macd.dif.at(-1) ?? 0;
  const dea = macd.dea.at(-1) ?? 0;
  const hist = macd.hist.at(-1) ?? 0;

  if (dif >= dea && hist >= 0) {
    return '金叉维持，红柱延续';
  }

  if (dif >= dea) {
    return 'DIF 位于 DEA 上方，动能偏强';
  }

  return 'MACD 仍在整理，动能确认不足';
}

function describeVolumeStatus(volumes) {
  const lastVolume = volumes.at(-1) ?? 0;
  const base = average(volumes.slice(-4, -1));

  if (lastVolume >= base * 1.08) {
    return '量能放大，资金承接偏积极';
  }

  if (lastVolume >= base * 0.95) {
    return '量能基本匹配，延续性尚可';
  }

  return '量能偏弱，仍需观察确认';
}

export function buildTechnicalSnapshot(points, { label = '指数' } = {}) {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error('points is required to build a technical snapshot.');
  }

  const candles = points.map((point) => ({
    open: Number(point.open),
    high: Number(point.high),
    low: Number(point.low),
    close: Number(point.close)
  }));
  const closes = candles.map((candle) => candle.close);
  const volumes = points.map((point) => Number(point.volume ?? 0));

  const ma5 = calculateMovingAverageSeries(closes, 5);
  const ma10 = calculateMovingAverageSeries(closes, 10);
  const ma20 = calculateMovingAverageSeries(closes, 20);
  const macd = calculateMacd(closes);

  const lastClose = closes.at(-1);
  const structure = describeStructure(lastClose, ma5.at(-1), ma10.at(-1), ma20.at(-1), macd);
  const maStatus = describeMaStatus(lastClose, ma5.at(-1), ma10.at(-1), ma20.at(-1));
  const macdStatus = describeMacdStatus(macd);
  const volumeStatus = describeVolumeStatus(volumes);

  return {
    name: label,
    badge: structure,
    structure,
    maStatus,
    macdStatus,
    volumeStatus,
    conclusion: `${label}当前呈现${structure}，量价与动能尚能相互验证，但仍需结合后续成交持续性确认。`,
    candles,
    ma5,
    ma10,
    ma20,
    volume: volumes,
    macd
  };
}
