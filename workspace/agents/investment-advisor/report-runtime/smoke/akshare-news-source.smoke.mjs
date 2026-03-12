import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJsonFile } from '../lib/io.mjs';
import { parseAkshareNewsPayload } from '../sources/akshare-news.mjs';

const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(runtimeRoot, '../fixtures');

const rawPayload = await readJsonFile(path.join(fixturesDir, 'akshare-news.raw.sample.json'));
const sourceResult = parseAkshareNewsPayload(rawPayload, {
  asOf: rawPayload.asOf,
  windowHours: 24
});

assert.equal(sourceResult.status, 'ok');
assert.equal(sourceResult.topNews.length, 3);
assert.equal(sourceResult.timelineEvents.length, 3);
assert.equal(sourceResult.cctvDigest.length, 2);
assert.deepEqual(
  new Set(sourceResult.topNews.map((item) => item.source)),
  new Set(['东方财富全球资讯', '财联社快讯', '新浪全球快讯'])
);
assert.match(sourceResult.summary, /24 小时|时间线/);
assert.ok(sourceResult.noiseFilter.some((item) => (item.text || '').includes('剔除')));

console.log('akshare-news-source smoke ok');
