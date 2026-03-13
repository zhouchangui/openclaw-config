import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STATE = {
  virtualBuys: [],
  currentPositions: [],
  selectionJournal: [],
  sellReviewJournal: [],
  stopEvents: [],
  portfolio: {
    initialCapital: 100000,
    cashBalance: 100000,
    realizedPnl: 0,
    feesPaid: 0
  },
  status: {
    enabled: true,
    stoppedBy: null,
    resumeRequired: false
  }
};

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

function createRecordedEvent(event) {
  return {
    ...event,
    recordedAt: new Date().toISOString()
  };
}

function mergeLoadedState(loaded) {
  return {
    ...DEFAULT_STATE,
    ...loaded,
    status: {
      ...DEFAULT_STATE.status,
      ...(loaded.status || {})
    }
  };
}

function ensureStateShape(state) {
  return mergeLoadedState(state || {});
}

async function writeStateSnapshot(statePath, state) {
  await writeJson(statePath, ensureStateShape(state));
}

async function appendStateEntry(loadState, saveState, key, event) {
  const state = await loadState();
  state[key].push(createRecordedEvent(event));
  await saveState(state);
  return state;
}

async function setStatus(loadState, saveState, statusPatch) {
  const state = await loadState();
  state.status = {
    ...state.status,
    ...statusPatch
  };
  await saveState(state);
  return state;
}

export function createStateStore({ workspaceRoot }) {
  const baseDir = path.join(workspaceRoot, 'data', 'overnight-holding');
  const statePath = path.join(baseDir, 'state.json');
  const journalsDir = path.join(baseDir, 'journals');

  async function loadState() {
    const loaded = await readJson(statePath, DEFAULT_STATE);
    return mergeLoadedState(loaded);
  }

  async function saveState(state) {
    await writeStateSnapshot(statePath, state);
  }

  return {
    loadState,

    saveState,

    async appendJournalEvent(tradingDate, phase, event) {
      const filePath = path.join(journalsDir, `${tradingDate}.${phase}-log.json`);
      const journal = await readJson(filePath, []);
      journal.push(createRecordedEvent(event));
      await writeJson(filePath, journal);
    },

    async appendSelectionJournal(event) {
      return appendStateEntry(loadState, saveState, 'selectionJournal', event);
    },

    async appendSellReviewJournal(event) {
      return appendStateEntry(loadState, saveState, 'sellReviewJournal', event);
    },

    async recordStopEvent(event) {
      const state = await this.loadState();
      state.stopEvents.push(createRecordedEvent(event));
      state.status.enabled = false;
      state.status.stoppedBy = event.type;
      state.status.resumeRequired = true;
      await this.saveState(state);
      return state;
    },

    async pauseByUser(event) {
      return this.recordStopEvent({
        ...event,
        type: 'user_pause'
      });
    },

    async requestResume(event) {
      const state = await this.loadState();
      state.status.resumeRequired = true;
      state.status.lastResumeRequest = createRecordedEvent(event);
      await this.saveState(state);
      return state;
    },

    async resume(event) {
      const state = await this.loadState();
      state.status.enabled = true;
      state.status.stoppedBy = null;
      state.status.resumeRequired = false;
      state.status.lastResumedAt = createRecordedEvent(event).recordedAt;
      await this.saveState(state);
      return state;
    },

    async setStatus(statusPatch) {
      return setStatus(loadState, saveState, statusPatch);
    }
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
