import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const smokeDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeRoot = path.resolve(smokeDir, '..');

const requiredFiles = [
  'README.md',
  'cli/run-selection.mjs',
  'cli/run-sell-review.mjs',
  'lib/io.mjs',
  'lib/schema-checks.mjs',
  'fixtures/README.md'
];

for (const relativePath of requiredFiles) {
  await access(path.join(runtimeRoot, relativePath));
}

const schemaModule = await import(
  pathToFileURL(path.join(runtimeRoot, 'lib/schema-checks.mjs')).href
);

assert.equal(typeof schemaModule.validateSelectionInput, 'function');
assert.equal(typeof schemaModule.validateSellReviewInput, 'function');

const readme = await readFile(path.join(runtimeRoot, 'README.md'), 'utf8');
assert.match(readme, /14:30/);
assert.match(readme, /09:35/);

console.log('overnight runtime foundation smoke ok');
