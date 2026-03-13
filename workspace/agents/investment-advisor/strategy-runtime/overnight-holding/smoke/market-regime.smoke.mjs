import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const smokeDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(smokeDir, '..');
const fixturesDir = path.join(runtimeRoot, 'fixtures');

const { evaluateMarketRegime } = await import(
  pathToFileURL(path.join(runtimeRoot, 'lib/market-regime.mjs')).href
);

const readFixture = async (name) => JSON.parse(
  await readFile(path.join(fixturesDir, `market-regime.${name}.json`), 'utf8')
);

const good = evaluateMarketRegime(await readFixture('good'));
assert.equal(good.tradable, true);
assert.ok(good.sectorContinuityScore >= 70);
assert.ok(good.reasons.length > 0);

const rotation = evaluateMarketRegime(await readFixture('rotation'));
assert.equal(rotation.tradable, false);
assert.ok(rotation.warnings.length > 0);

const bad = evaluateMarketRegime(await readFixture('bad'));
assert.equal(bad.tradable, false);
assert.ok(bad.sectorContinuityScore < 60);

console.log('market-regime smoke ok');
