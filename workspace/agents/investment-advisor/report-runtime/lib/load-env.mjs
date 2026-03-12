import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';

import { resolveWorkspaceRoot } from './paths.mjs';

const DEFAULT_ENV_FILES = ['.env', '.env.local'];

async function readIfExists(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function loadWorkspaceEnv({
  workspaceRoot = resolveWorkspaceRoot(),
  envFileNames = DEFAULT_ENV_FILES
} = {}) {
  const mergedEnv = {};
  const loadedFiles = [];

  for (const fileName of envFileNames) {
    const filePath = path.join(workspaceRoot, fileName);
    const content = await readIfExists(filePath);
    if (content === null) {
      continue;
    }

    Object.assign(mergedEnv, parseEnv(content));
    loadedFiles.push(filePath);
  }

  for (const [key, value] of Object.entries(mergedEnv)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }

  return {
    workspaceRoot,
    loadedFiles
  };
}
