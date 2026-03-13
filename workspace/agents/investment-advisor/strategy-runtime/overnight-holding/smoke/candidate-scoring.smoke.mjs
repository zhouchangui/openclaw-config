import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const smokeDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(smokeDir, '..');
const fixture = JSON.parse(
  await readFile(path.join(runtimeRoot, 'fixtures', 'candidates.sample.json'), 'utf8')
);

const { scoreCandidates } = await import(
  pathToFileURL(path.join(runtimeRoot, 'lib/score-candidates.mjs')).href
);

const leader = scoreCandidates({
  variant: 'leader',
  sectorContinuityScore: fixture.sectorContinuityScore,
  candidates: fixture.candidates
});
assert.equal(leader.variant, 'leader');
assert.equal(leader.ranked[0].symbol, '300750');
assert.equal(leader.ranked[0].rejectReason, null);

const midcore = scoreCandidates({
  variant: 'midcore',
  sectorContinuityScore: fixture.sectorContinuityScore,
  candidates: fixture.candidates
});
assert.equal(midcore.variant, 'midcore');
assert.equal(midcore.ranked[0].symbol, '600519');
assert.ok(midcore.ranked[0].selectionReasons.length > 0);

const blocked = scoreCandidates({
  variant: 'leader',
  sectorContinuityScore: 58,
  candidates: fixture.candidates.slice(0, 1)
});
assert.equal(blocked.ranked[0].rejectReason, 'sector_continuity_below_threshold');

console.log('candidate-scoring smoke ok');
