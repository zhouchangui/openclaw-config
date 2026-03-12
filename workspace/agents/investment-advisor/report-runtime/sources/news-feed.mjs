function readAttr(block, attrName) {
  const match = block.match(new RegExp(`${attrName}="([^"]+)"`));
  return match ? match[1] : null;
}

function readTag(block, tagName) {
  const match = block.match(new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)</${tagName}>`, 'i'));
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

export function parseNewsFeedHtml(html, { fetchedAt = null } = {}) {
  const issues = [];
  const articleBlocks = [...html.matchAll(/<article\b[\s\S]*?<\/article>/gi)].map((match) => match[0]);
  const items = articleBlocks.map((block, index) => {
    const linkMatch = block.match(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const item = {
      id: `news-${index + 1}`,
      category: readAttr(block, 'data-category'),
      publishedAt: readAttr(block, 'data-published-at'),
      url: linkMatch?.[1] ?? null,
      title: linkMatch?.[2] ? linkMatch[2].replace(/\s+/g, ' ').trim() : null,
      summary: readTag(block, 'p')
    };

    if (!item.category || !item.publishedAt || !item.url || !item.title || !item.summary) {
      issues.push(`news item ${index + 1} is incomplete`);
    }

    return item;
  });

  if (items.length === 0) {
    issues.push('news feed contains no articles');
  }

  return {
    source: 'news-feed',
    fetchedAt,
    status: issues.length === 0 ? 'ok' : 'partial',
    issues,
    items
  };
}

export async function fetchNewsFeed({
  url = process.env.INVESTMENT_NEWS_FEED_URL,
  fetchImpl = globalThis.fetch
} = {}) {
  if (!url) {
    throw new Error(
      'News feed live fetch requires INVESTMENT_NEWS_FEED_URL or an explicit url parameter.'
    );
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch implementation is required for live news feed requests.');
  }

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`News feed request failed: ${response.status}`);
  }

  return parseNewsFeedHtml(await response.text(), {
    fetchedAt: new Date().toISOString()
  });
}
