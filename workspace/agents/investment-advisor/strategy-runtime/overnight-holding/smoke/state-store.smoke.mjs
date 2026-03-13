import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const smokeDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(smokeDir, '..');

const { createStateStore } = await import(
  pathToFileURL(path.join(runtimeRoot, 'lib/state-store.mjs')).href
);

const root = await mkdtemp(path.join(tmpdir(), 'overnight-state-'));

try {
  const store = createStateStore({ workspaceRoot: root });

  const state = await store.loadState();
  state.virtualBuys.push({ symbol: '300750', tradingDate: '2026-03-12' });
  state.currentPositions.push({ symbol: '300750', status: 'open' });
  await store.saveState(state);

  await store.appendJournalEvent('2026-03-12', 'selection', { type: 'selection_started' });
  await store.appendJournalEvent('2026-03-12', 'selection', { type: 'selection_completed' });
  await store.appendJournalEvent('2026-03-13', 'sell-review', { type: 'sell_review_snapshot' });
  await store.recordStopEvent({ type: 'market_stop', tradingDate: '2026-03-12' });
  await store.recordStopEvent({ type: 'user_pause', tradingDate: '2026-03-12' });
  const resumed = await store.resume({ tradingDate: '2026-03-13', reason: 'user_confirmed' });
  assert.equal(resumed.status.enabled, true);
  assert.equal(resumed.status.resumeRequired, false);

  const resumeRequestedWhileEnabled = await store.requestResume({
    tradingDate: '2026-03-13',
    reason: 'market_recovered'
  });
  assert.equal(resumeRequestedWhileEnabled.status.enabled, false);
  assert.equal(resumeRequestedWhileEnabled.status.resumeRequired, true);

  const reloaded = await store.loadState();
  assert.equal(reloaded.virtualBuys.length, 1);
  assert.equal(reloaded.currentPositions.length, 1);
  assert.equal(reloaded.stopEvents.length, 2);

  const selectionJournal = JSON.parse(
    await readFile(path.join(root, 'data', 'overnight-holding', 'journals', '2026-03-12.selection-log.json'), 'utf8')
  );
  const sellReviewJournal = JSON.parse(
    await readFile(path.join(root, 'data', 'overnight-holding', 'journals', '2026-03-13.sell-review-log.json'), 'utf8')
  );

  assert.equal(selectionJournal.length, 2);
  assert.equal(selectionJournal[0].type, 'selection_started');
  assert.equal(sellReviewJournal[0].type, 'sell_review_snapshot');

  console.log('state-store smoke ok');
} finally {
  await rm(root, { recursive: true, force: true });
}
