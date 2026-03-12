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

function mountTopNews() {
  const root = document.getElementById('top-news-grid');
  (reportData.topNews || []).slice(0, 3).forEach((item) => {
    const card = createEl('article', 'event-card');
    card.appendChild(createEl('div', 'mini-title', item.bias));
    card.appendChild(createEl('h3', '', item.title));
    card.appendChild(createEl('p', '', item.summary));
    card.appendChild(createEl('p', 'meta-inline', `${item.source}｜${item.publishedAt}`));
    card.appendChild(createEl('p', 'meta-inline', `${item.category}｜${item.impactTarget}`));
    card.appendChild(createEl('p', '', `影响路径：${item.impactPath}`));
    root.appendChild(card);
  });
}

function mountTimeline() {
  const root = document.getElementById('timeline-list');
  (reportData.timelineEvents || []).slice(0, 6).forEach((item) => {
    const row = createEl('article', 'timeline-item');
    const meta = createEl('div', 'timeline-meta');
    meta.appendChild(createEl('span', 'timeline-source', item.source));
    meta.appendChild(createEl('span', 'timeline-time', item.publishedAt));
    row.appendChild(meta);
    row.appendChild(createEl('h3', '', item.title));
    row.appendChild(createEl('p', '', item.summary));
    if (item.url) {
      const link = createEl('a', 'timeline-link', '查看原文');
      link.href = item.url;
      link.target = '_blank';
      link.rel = 'noreferrer noopener';
      row.appendChild(link);
    }
    root.appendChild(row);
  });
}

function mountImpactMatrix() {
  const root = document.getElementById('impact-grid');
  (reportData.impactMatrix || []).forEach((item) => {
    const card = createEl('article', 'signal-card');
    card.appendChild(createEl('h3', '', item.title));
    card.appendChild(createEl('p', '', `影响对象：${item.target}`));
    card.appendChild(createEl('p', '', `影响方向：${item.bias}`));
    card.appendChild(createEl('p', '', item.path));
    root.appendChild(card);
  });
}

function mountList(targetId, items) {
  const root = document.getElementById(targetId);
  (items || []).forEach((item) => {
    const text = typeof item === 'string' ? item : item.text || item.title;
    root.appendChild(createEl('li', '', text));
  });
}

function init() {
  mountTags();
  mountSummaries();
  mountMetrics();
  mountTopNews();
  mountTimeline();
  mountImpactMatrix();
  mountList('follow-up-list', reportData.followUps || []);
  mountList('risk-list', reportData.risks || []);
}

init();
