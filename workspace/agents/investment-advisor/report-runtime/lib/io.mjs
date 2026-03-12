import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true });
  return dirPath;
}

export async function readTextFile(filePath) {
  return readFile(filePath, 'utf8');
}

export async function readJsonFile(filePath) {
  return JSON.parse(await readTextFile(filePath));
}

export async function writeTextFile(filePath, content) {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content, 'utf8');
  return filePath;
}

export async function writeJsonFile(filePath, value) {
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}
