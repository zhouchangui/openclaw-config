const reportData = __REPORT_DATA__;

function createEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}

function mountTags() {
  const box = document.getElementById('highlight-tags');
  (reportData.conclusion.tags || []).forEach((tag) => {
    box.appendChild(createEl('span', 'highlight-tag', tag));
  });
}

function mountSummaries() {
  const grid = document.getElementById('summary-grid');
  (reportData.summaryCards || []).forEach((item) => {
    const card = createEl('article', 'summary-card');
    card.appendChild(createEl('h3', '', item.title));
    card.appendChild(createEl('p', '', item.text));
    grid.appendChild(card);
  });
}

function mountMetrics() {
  const grid = document.getElementById('metric-grid');
  (reportData.metrics || []).forEach((item) => {
    const card = createEl('article', 'metric-card');
    card.appendChild(createEl('div', 'metric-name', item.name));
    card.appendChild(createEl('div', 'metric-value', item.value));
    const change = createEl('div', `metric-change ${item.changeClass || ''}`, item.change);
    card.appendChild(change);
    card.appendChild(createEl('div', 'metric-note', item.note));
    grid.appendChild(card);
  });
}

function mountBars(targetId, items, negative = false) {
  const root = document.getElementById(targetId);
  const max = Math.max(...items.map((x) => Math.abs(x.value)), 1);

  items.forEach((item) => {
    const row = createEl('div', 'bar-item');
    row.appendChild(createEl('div', 'bar-label', item.label));

    const track = createEl('div', 'bar-track');
    const fill = createEl('div', `bar-fill ${negative ? 'negative' : ''}`);
    fill.style.width = `${Math.max((Math.abs(item.value) / max) * 100, 6)}%`;
    track.appendChild(fill);

    row.appendChild(track);
    row.appendChild(createEl('div', `bar-value ${negative ? 'negative' : 'positive'}`, item.display));
    root.appendChild(row);
  });
}

function mountStructure() {
  const box = document.getElementById('structure-analysis');
  (reportData.structureAnalysis || []).forEach((text) => {
    box.appendChild(createEl('p', '', text));
  });
}

function mountList(targetId, items) {
  const root = document.getElementById(targetId);
  items.forEach((item) => {
    root.appendChild(createEl('li', '', item));
  });
}

function mountTable() {
  const body = document.getElementById('detail-table');
  (reportData.detailRows || []).forEach((row) => {
    const tr = document.createElement('tr');
    [row.dimension, row.value, row.change, row.interpretation].forEach((cell) => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function linePath(points) {
  if (!points.length) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
}

function mountTechnicalCharts() {
  const root = document.getElementById('technical-grid');
  (reportData.technicalCharts || []).forEach((chart) => {
    const card = createEl('article', 'tech-card');
    const head = createEl('div', 'tech-card-head');
    head.appendChild(createEl('h3', '', chart.name));
    head.appendChild(createEl('span', 'tech-badge', chart.badge));
    card.appendChild(head);

    const svg = buildTechSvg(chart);
    svg.classList.add('tech-svg');
    card.appendChild(svg);

    const metrics = createEl('div', 'tech-metrics');
    [
      ['结构状态', chart.structure],
      ['均线状态', chart.maStatus],
      ['MACD 状态', chart.macdStatus],
      ['量价关系', chart.volumeStatus]
    ].forEach(([label, value]) => {
      const item = createEl('div', 'tech-metric');
      item.appendChild(createEl('span', 'tech-metric-label', label));
      item.appendChild(createEl('span', 'tech-metric-value', value));
      metrics.appendChild(item);
    });
    card.appendChild(metrics);
    card.appendChild(createEl('div', 'tech-conclusion', chart.conclusion));
    root.appendChild(card);
  });
}

function buildTechSvg(chart) {
  const width = 360;
  const height = 230;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': `${chart.name}技术图` });

  const bg = svgEl('rect', { x: 0, y: 0, width, height, rx: 16, fill: 'transparent' });
  svg.appendChild(bg);

  const plot = { x: 18, y: 18, w: width - 36, h: 110 };
  const vol = { x: 18, y: 138, w: width - 36, h: 28 };
  const macd = { x: 18, y: 175, w: width - 36, h: 36 };

  for (let i = 0; i <= 4; i++) {
    const y = plot.y + (plot.h / 4) * i;
    svg.appendChild(svgEl('line', { x1: plot.x, y1: y, x2: plot.x + plot.w, y2: y, stroke: 'rgba(196,132,83,0.14)', 'stroke-width': 1 }));
  }

  const prices = chart.candles.flatMap(c => [c.high, c.low, c.open, c.close]);
  const pMin = Math.min(...prices);
  const pMax = Math.max(...prices);
  const priceY = (v) => plot.y + (1 - (v - pMin) / ((pMax - pMin) || 1)) * plot.h;

  const step = plot.w / chart.candles.length;
  const bodyW = Math.max(step * 0.52, 8);

  chart.candles.forEach((c, idx) => {
    const cx = plot.x + step * idx + step / 2;
    const color = c.close >= c.open ? '#d94f3d' : '#12966b';
    svg.appendChild(svgEl('line', { x1: cx, y1: priceY(c.high), x2: cx, y2: priceY(c.low), stroke: color, 'stroke-width': 1.6 }));
    const top = Math.min(priceY(c.open), priceY(c.close));
    const h = Math.max(Math.abs(priceY(c.open) - priceY(c.close)), 2.5);
    svg.appendChild(svgEl('rect', { x: cx - bodyW / 2, y: top, width: bodyW, height: h, rx: 2, fill: color, opacity: 0.9 }));
  });

  ['ma5', 'ma10', 'ma20'].forEach((key, idx) => {
    const colors = ['#f26b1d', '#f7b267', '#6c8bd8'];
    const vals = chart[key] || [];
    const pts = vals.map((v, i) => [plot.x + step * i + step / 2, priceY(v)]);
    svg.appendChild(svgEl('path', {
      d: linePath(pts),
      fill: 'none',
      stroke: colors[idx],
      'stroke-width': 2,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round'
    }));
  });

  const volMax = Math.max(...chart.volume, 1);
  chart.volume.forEach((v, idx) => {
    const x = vol.x + step * idx + step * 0.18;
    const h = (v / volMax) * vol.h;
    const candle = chart.candles[idx];
    const color = candle.close >= candle.open ? 'rgba(217,79,61,0.68)' : 'rgba(18,150,107,0.68)';
    svg.appendChild(svgEl('rect', { x, y: vol.y + vol.h - h, width: step * 0.64, height: h, rx: 2, fill: color }));
  });

  const macdAbs = Math.max(...chart.macd.hist.map(v => Math.abs(v)), 0.01);
  const macdZero = macd.y + macd.h / 2;
  svg.appendChild(svgEl('line', { x1: macd.x, y1: macdZero, x2: macd.x + macd.w, y2: macdZero, stroke: 'rgba(196,132,83,0.22)', 'stroke-width': 1 }));
  chart.macd.hist.forEach((v, idx) => {
    const h = Math.abs(v) / macdAbs * (macd.h / 2 - 2);
    const x = macd.x + step * idx + step * 0.22;
    const y = v >= 0 ? macdZero - h : macdZero;
    svg.appendChild(svgEl('rect', { x, y, width: step * 0.56, height: h, rx: 2, fill: v >= 0 ? 'rgba(217,79,61,0.75)' : 'rgba(18,150,107,0.75)' }));
  });

  const macdLineY = (v) => macd.y + (1 - (v + macdAbs) / (2 * macdAbs || 1)) * macd.h;
  [['dif', '#f26b1d'], ['dea', '#6c8bd8']].forEach(([key, color]) => {
    const pts = chart.macd[key].map((v, i) => [macd.x + step * i + step / 2, macdLineY(v)]);
    svg.appendChild(svgEl('path', {
      d: linePath(pts), fill: 'none', stroke: color, 'stroke-width': 1.8,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round'
    }));
  });

  const labels = [
    ['K线 / MA', plot.x, plot.y - 4],
    ['VOL', vol.x, vol.y - 4],
    ['MACD', macd.x, macd.y - 4]
  ];
  labels.forEach(([text, x, y]) => {
    const t = svgEl('text', { x, y, fill: '#7a6556', 'font-size': 10, 'font-weight': 700 });
    t.textContent = text;
    svg.appendChild(t);
  });

  return svg;
}

function init() {
  mountTags();
  mountSummaries();
  mountMetrics();
  mountTechnicalCharts();
  mountBars('index-chart', reportData.indexChart || []);
  mountBars('leaders-chart', reportData.leadersChart || []);
  mountBars('laggards-chart', reportData.laggardsChart || [], true);
  mountStructure();
  mountList('next-watch-list', reportData.nextWatch || []);
  mountList('risk-list', reportData.risks || []);
  mountTable();
}

init();
