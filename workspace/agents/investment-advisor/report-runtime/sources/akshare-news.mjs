import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { readJsonFile } from '../lib/io.mjs';

const execFile = promisify(execFileCallback);

const INVESTMENT_KEYWORDS = [
  '央行', '流动性', '降息', '加息', 'MLF', 'LPR', 'CPI', 'PPI', '通胀', '美债', '收益率',
  '汇率', '美元', '人民币', '科技', 'AI', '人工智能', '算力', '芯片', '半导体', '机器人',
  '智能制造', '新能源', '储能', '光伏', '电网', '原油', '石油', '天然气', '煤炭', '有色',
  '券商', '银行', '业绩', '财报', '招标', '政策', '工信部', '国务院', '发改委', '会议',
  '美股', '港股', 'A股', '纳指', '标普', '道琼斯'
];

const NOISE_KEYWORDS = [
  '世界杯', '足球', '篮球', '球队', '体育', '明星', '综艺', '电影', '演唱会', '娱乐'
];

const POSITIVE_KEYWORDS = [
  '上调', '增长', '回落', '改善', '回升', '提速', '支持', '推进', '净投放', '宽松', '友好'
];

const NEGATIVE_KEYWORDS = [
  '下调', '下降', '收紧', '制裁', '冲突', '袭击', '风险', '下滑', '恶化', '裁员'
];

const CATEGORY_RULES = [
  {
    category: '宏观流动性',
    keywords: ['央行', '流动性', '降息', '加息', 'MLF', 'LPR', 'CPI', 'PPI', '通胀', '美债', '收益率', '汇率']
  },
  {
    category: '产业政策',
    keywords: ['国务院', '工信部', '发改委', '政策', '会议', '规划', '指导意见', '支持']
  },
  {
    category: '科技制造',
    keywords: ['科技', 'AI', '人工智能', '算力', '芯片', '半导体', '机器人', '智能制造']
  },
  {
    category: '能源与资源',
    keywords: ['原油', '石油', '天然气', '煤炭', '新能源', '储能', '光伏', '电网', '有色']
  },
  {
    category: '海外宏观',
    keywords: ['美股', '纳指', '标普', '道琼斯', '美国', '欧洲', '日本', '韩国', '海外']
  }
];

function truncate(text, maxLength = 160) {
  if (typeof text !== 'string') {
    return '';
  }
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function toDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) {
    return value || '';
  }

  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(date);

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day} ${byType.hour}:${byType.minute}`;
}

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countMatches(text, keywords) {
  return keywords.reduce((total, keyword) => total + (text.includes(keyword) ? 1 : 0), 0);
}

function relevanceScore(text) {
  const noiseCount = countMatches(text, NOISE_KEYWORDS);
  if (noiseCount > 0) {
    return -100;
  }

  return countMatches(text, INVESTMENT_KEYWORDS);
}

function inferBias(text) {
  const positive = countMatches(text, POSITIVE_KEYWORDS);
  const negative = countMatches(text, NEGATIVE_KEYWORDS);

  if (positive > negative) {
    return '偏多';
  }

  if (negative > positive) {
    return '偏空';
  }

  return '中性';
}

function inferCategory(text) {
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return rule.category;
    }
  }

  return '市场快讯';
}

function inferImpactTarget(category) {
  switch (category) {
    case '宏观流动性':
      return 'A股指数与成长风格';
    case '产业政策':
      return '政策受益行业';
    case '科技制造':
      return '科技制造链';
    case '能源与资源':
      return '能源与资源链';
    case '海外宏观':
      return '全球风险资产';
    default:
      return '市场情绪';
  }
}

function buildImpactPath(category, bias) {
  const direction = bias === '偏空' ? '压制' : bias === '偏多' ? '支撑' : '影响';
  switch (category) {
    case '宏观流动性':
      return `宏观流动性变化 -> ${direction}风险偏好 -> 影响指数与成长估值`;
    case '产业政策':
      return `政策催化释放 -> ${direction}产业景气预期 -> 影响相关板块表现`;
    case '科技制造':
      return `产业新闻强化主线 -> ${direction}科技制造关注度 -> 影响高弹性方向`;
    case '能源与资源':
      return `能源与资源变量变化 -> ${direction}成本与供需预期 -> 影响周期链条`;
    case '海外宏观':
      return `海外宏观变量变化 -> ${direction}全球风险偏好 -> 影响A股映射方向`;
    default:
      return `事件信息变化 -> ${direction}市场情绪 -> 等待盘面确认`;
  }
}

function dedupeEvents(events) {
  const seen = new Set();
  return events.filter((event) => {
    const key = `${event.source}|${event.title}|${event.publishedAt}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildSignals(events, category, fallbackText) {
  const texts = events
    .filter((event) => event.category === category)
    .slice(0, 3)
    .map((event) => ({ text: `${event.title}：${event.summary}` }));

  return texts.length > 0 ? texts : [{ text: fallbackText }];
}

function buildFollowUps(events) {
  return events.slice(0, 3).map((event) => `关注「${event.title}」是否在盘面与成交额层面得到进一步确认。`);
}

function buildRisks(events) {
  const risks = ['新闻时间线用于补齐信息，不直接等同于交易结论。'];
  if (events.some((event) => event.bias === '偏空')) {
    risks.push('偏空事件若在盘中继续发酵，需要及时下调风险偏好判断。');
  } else {
    risks.push('若盘面没有承接，时间线中的利多只能视为信息层变量。');
  }
  return risks;
}

function buildDetailRows(events) {
  return events.slice(0, 8).map((event) => ({
    dimension: event.title,
    value: event.source,
    change: event.publishedAtDisplay || event.publishedAt,
    interpretation: event.summary
  }));
}

export function parseAkshareNewsPayload(payload, { asOf = payload?.asOf, windowHours = payload?.windowHours ?? 24 } = {}) {
  const issues = Array.isArray(payload?.issues) ? [...payload.issues] : [];
  const endAt = toDate(asOf) || new Date();
  const startAt = new Date(endAt.getTime() - windowHours * 60 * 60 * 1000);

  const rawEvents = Array.isArray(payload?.items) ? payload.items : [];
  const normalizedEvents = dedupeEvents(
    rawEvents
      .map((item) => {
        const title = cleanText(item.title) || truncate(cleanText(item.content || item.summary), 40);
        const summary = cleanText(item.summary) || truncate(cleanText(item.content), 160);
        const source = cleanText(item.source) || 'akshare';
        const publishedAt = toDate(item.publishedAt);
        if (!title || !summary || !source || !publishedAt) {
          return null;
        }

        const text = `${title} ${summary} ${cleanText(item.content)}`;
        const score = relevanceScore(text);
        if (score <= 0) {
          return null;
        }

        const category = inferCategory(text);
        const bias = inferBias(text);
        return {
          source,
          title,
          summary,
          url: item.url || null,
          publishedAt: publishedAt.toISOString(),
          publishedAtDisplay: formatDateTime(publishedAt.toISOString()),
          category,
          bias,
          impactTarget: inferImpactTarget(category),
          impactPath: buildImpactPath(category, bias),
          score
        };
      })
      .filter(Boolean)
      .filter((item) => {
        const publishedAt = toDate(item.publishedAt);
        return publishedAt && publishedAt >= startAt && publishedAt <= endAt;
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return new Date(right.publishedAt) - new Date(left.publishedAt);
      })
  );

  if (normalizedEvents.length === 0) {
    issues.push('No investment-related Akshare news found in the last 24 hours.');
  }

  const topNews = normalizedEvents.slice(0, 6).map((item) => ({
    title: item.title,
    category: item.category,
    bias: item.bias,
    impactTarget: item.impactTarget,
    impactPath: item.impactPath,
    summary: item.summary,
    source: item.source,
    publishedAt: item.publishedAtDisplay,
    url: item.url
  }));

  const timelineEvents = normalizedEvents.slice(0, 24).map((item) => ({
    source: item.source,
    publishedAt: item.publishedAtDisplay,
    title: item.title,
    summary: item.summary,
    category: item.category,
    url: item.url
  }));

  const cctvDigest = (Array.isArray(payload?.cctv) ? payload.cctv : [])
    .slice(0, 6)
    .map((item) => ({
      source: cleanText(item.source) || '央视新闻',
      publishedAt: cleanText(item.date) || '',
      title: cleanText(item.title),
      summary: cleanText(item.summary)
    }))
    .filter((item) => item.title && item.summary);

  const categories = Array.from(new Set(topNews.map((item) => item.category))).slice(0, 3);
  const headline = topNews.length > 0
    ? `过去 24 小时里，真正值得投资者跟踪的变量集中在${categories.join('、')}。`
    : '过去 24 小时内没有筛到高置信度的投资相关新闻。';
  const summary = topNews.length > 0
    ? `本报告按过去 ${windowHours} 小时窗口筛选投资相关快讯，共保留 ${timelineEvents.length} 条，并额外单列 CCTV 新闻摘要。`
    : `本报告按过去 ${windowHours} 小时窗口筛选投资相关快讯，但当前没有保留条目。`;

  const noiseFiltered = rawEvents.length - normalizedEvents.length;
  const status = normalizedEvents.length > 0 && issues.length === 0 ? 'ok' : 'partial';

  return {
    fetchedAt: payload?.fetchedAt || new Date().toISOString(),
    status,
    headline,
    summary,
    conclusionTags: ['24h 时间线', ...categories].slice(0, 3),
    topNews,
    timelineEvents,
    cctvDigest,
    macroSignals: buildSignals(topNews, '宏观流动性', '过去 24 小时宏观流动性变量相对有限。'),
    policySignals: buildSignals(topNews, '产业政策', '过去 24 小时政策面没有新的强催化。'),
    industrySignals: buildSignals(topNews, '科技制造', '过去 24 小时行业主线信号相对分散。'),
    noiseFilter: [
      {
        title: '非投资类信息已剔除',
        text: `原始抓取 ${rawEvents.length} 条，已剔除 ${Math.max(noiseFiltered, 0)} 条与投资无关或低相关信息。`
      }
    ],
    followUps: buildFollowUps(topNews),
    risks: buildRisks(topNews),
    detailRows: buildDetailRows(topNews)
  };
}

export async function fetchAkshareNewsTimeline({
  asOf = new Date().toISOString(),
  windowHours = 24,
  pythonBin = process.env.INVESTMENT_AKSHARE_PYTHON || 'python3',
  execFileImpl = execFile
} = {}) {
  if (process.env.INVESTMENT_AKSHARE_NEWS_FIXTURE_FILE) {
    const payload = await readJsonFile(process.env.INVESTMENT_AKSHARE_NEWS_FIXTURE_FILE);
    return {
      source: payload.source || 'akshare-news',
      ...payload
    };
  }

  const scriptPath = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '..',
    'python',
    'akshare_news_timeline.py'
  );

  const { stdout } = await execFileImpl(
    pythonBin,
    [scriptPath, '--as-of', asOf, '--window-hours', String(windowHours)],
    {
      maxBuffer: 10 * 1024 * 1024
    }
  );

  return {
    source: 'akshare-news',
    ...parseAkshareNewsPayload(JSON.parse(stdout), { asOf, windowHours })
  };
}
