import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const htmlPath = path.join(workspaceRoot, 'report-templates', 'closing-market-report', 'index.html');
const cssPath = path.join(workspaceRoot, 'report-templates', 'closing-market-report', 'styles.css');

const [html, css] = await Promise.all([
  readFile(htmlPath, 'utf8'),
  readFile(cssPath, 'utf8')
]);

assert.match(html, /class="hero-conclusion-block"/, 'hero should promote a dedicated conclusion block in the main column');
assert.match(html, /class="badge"/, 'hero should keep a lightweight badge for minimal context');
assert.doesNotMatch(html, /class="report-id"/, 'hero should not show report id metadata on the first screen');
assert.doesNotMatch(html, /class="hero-meta-strip"/, 'hero should remove the full metadata strip from the first screen');
assert.doesNotMatch(html, /class="hero-highlight"/, 'hero should no longer use a separate right-side highlight card');
assert.doesNotMatch(html, /class="hero-summary"/, 'hero should not repeat the same judgment in a secondary summary line');
assert.match(html, /<h1>\{\{\s*title\s*\}\}<\/h1>/, 'hero heading should fall back to the fixed report title');

assert.match(css, /\.hero-card\s*\{[\s\S]*grid-template-columns:\s*1fr;/, 'hero should use a single-column layout');
assert.match(css, /\.hero-conclusion-text\s*\{[\s\S]*font-size:\s*clamp\(30px,\s*3\.4vw,\s*46px\)/, 'conclusion block should become the dominant hero text');
assert.match(css, /\.hero-conclusion-block\s*\{[\s\S]*padding:\s*0;/, 'conclusion block should not look like an inset card');
assert.match(css, /\.hero-conclusion-block\s*\{[\s\S]*background:\s*none;/, 'conclusion block should span directly without a filled card background');
assert.match(css, /\.badge\s*\{[\s\S]*font-size:\s*11px;/, 'badge should be visually weakened');
assert.match(css, /\.badge\s*\{[\s\S]*opacity:\s*0\.72;/, 'badge should remain subtle on the first screen');

console.log('closing-hero-layout smoke ok');
