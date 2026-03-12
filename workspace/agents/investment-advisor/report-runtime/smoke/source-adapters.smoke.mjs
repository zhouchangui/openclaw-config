import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJsonFile } from '../lib/io.mjs';
import { buildTechnicalSnapshot } from '../lib/technical-indicators.mjs';
import { parseEastmoneyKlinePayload } from '../sources/eastmoney-kline.mjs';
import { parseEastmoneySectorsPayload } from '../sources/eastmoney-sectors.mjs';
import { parseNewsFeedHtml } from '../sources/news-feed.mjs';
import { parseTencentQuotesPayload } from '../sources/tencent-quotes.mjs';

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(runtimeRoot, '../fixtures');

const quotePayload = await readJsonFile(path.join(fixturesDir, 'tencent-quotes.sample.json'));
const quotes = parseTencentQuotesPayload(quotePayload);

assert.equal(quotes.status, 'ok');
assert.equal(quotes.indices.length, 3);
assert.equal(quotes.indices[0].symbol, 'sh000001');

const sectorPayload = await readJsonFile(path.join(fixturesDir, 'eastmoney-sectors.sample.json'));
const sectors = parseEastmoneySectorsPayload(sectorPayload);

assert.equal(sectors.status, 'ok');
assert.ok(sectors.leaders.length >= 3);
assert.ok(sectors.laggards.length >= 3);

const klinePayload = await readJsonFile(path.join(fixturesDir, 'eastmoney-kline.sample.json'));
const kline = parseEastmoneyKlinePayload(klinePayload);

assert.equal(kline.status, 'ok');
assert.equal(kline.series.length, 3);

const technical = buildTechnicalSnapshot(kline.series[0].points, {
  label: kline.series[0].name
});

assert.equal(technical.candles.length, kline.series[0].points.length);
assert.equal(technical.ma5.length, kline.series[0].points.length);
assert.equal(technical.ma10.length, kline.series[0].points.length);
assert.equal(technical.ma20.length, kline.series[0].points.length);
assert.equal(technical.macd.dif.length, kline.series[0].points.length);
assert.ok(typeof technical.conclusion === 'string' && technical.conclusion.length > 0);

const newsHtml = await readFile(path.join(fixturesDir, 'news-feed.sample.html'), 'utf8');
const news = parseNewsFeedHtml(newsHtml);

assert.equal(news.status, 'ok');
assert.equal(news.items.length, 3);
assert.equal(news.items[0].category, 'policy');

console.log('source-adapters smoke ok');
