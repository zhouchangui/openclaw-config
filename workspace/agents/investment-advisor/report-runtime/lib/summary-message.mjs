function truncate(text, maxLength = 120) {
  if (typeof text !== 'string') {
    return '';
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

export function buildSummaryMessage(reportData, { url } = {}) {
  const lines = [];
  const title = reportData.title || `${reportData.reportType} report`;
  const conclusion = reportData.conclusion?.text || reportData.summary || '';

  lines.push(title);
  lines.push(`结论：${truncate(conclusion, 160)}`);

  (reportData.summaryCards || []).slice(0, 3).forEach((card) => {
    lines.push(`- ${card.title}：${truncate(card.text, 90)}`);
  });

  const hasPartialSource = (reportData.sources || []).some((source) => source.status !== 'ok');
  if (reportData.status === 'partial' || reportData.fallbackLevel !== 'none' || hasPartialSource) {
    lines.push('提示：部分数据待补齐，请结合本地归档结果复核。');
  }

  if (url) {
    lines.push(`链接：${url}`);
  }

  return lines.join('\n');
}
