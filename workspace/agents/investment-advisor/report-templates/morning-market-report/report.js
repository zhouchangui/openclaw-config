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
    card.appendChild(createEl('div', `metric-change ${item.changeClass || ''}`, item.change));
    card.appendChild(createEl('div', 'metric-note', item.note));
    grid.appendChild(card);
  });
}

function mountBars() {
  const root = document.getElementById('global-bars');
  const items = reportData.globalMarkets || [];
  const max = Math.max(...items.map((x) => Math.abs(x.value)), 1);
  items.forEach((item) => {
    const row = createEl('div', 'bar-item');
    row.appendChild(createEl('div', 'bar-label', item.label));
    const track = createEl('div', 'bar-track');
    const fill = createEl('div', `bar-fill ${item.value < 0 ? 'negative' : ''}`);
    fill.style.width = `${Math.max((Math.abs(item.value) / max) * 100, 8)}%`;
    track.appendChild(fill);
    row.appendChild(track);
    row.appendChild(createEl('div', `bar-value ${item.value < 0 ? 'negative' : 'positive'}`, item.display));
    root.appendChild(row);
  });
}

function mountFocusAreas() {
  const root = document.getElementById('focus-grid');
  (reportData.focusAreas || []).forEach((item) => {
    const card = createEl('article', 'event-card');
    card.appendChild(createEl('div', 'mini-title', item.bias));
    card.appendChild(createEl('h3', '', item.title));
    card.appendChild(createEl('p', '', item.text));
    root.appendChild(card);
  });
}

function mountParagraphs(targetId, items) {
  const root = document.getElementById(targetId);
  (items || []).forEach((item) => {
    root.appendChild(createEl('p', '', item));
  });
}

function mountSignalCards() {
  const root = document.getElementById('policy-grid');
  (reportData.policySignals || []).forEach((item) => {
    const card = createEl('article', 'signal-card');
    card.appendChild(createEl('h3', '', item.title));
    card.appendChild(createEl('p', '', item.text));
    root.appendChild(card);
  });
}

function mountList(targetId, items) {
  const root = document.getElementById(targetId);
  (items || []).forEach((item) => {
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

function init() {
  mountTags();
  mountSummaries();
  mountMetrics();
  mountBars();
  mountFocusAreas();
  mountParagraphs('premarket-bias', reportData.premarketBias || []);
  mountSignalCards();
  mountList('today-watch-list', reportData.todayWatch || []);
  mountList('risk-list', reportData.risks || []);
  mountTable();
}

init();
