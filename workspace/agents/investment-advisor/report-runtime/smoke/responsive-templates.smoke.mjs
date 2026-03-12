import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const templateChecks = [
  {
    name: 'closing',
    cssPath: path.join(workspaceRoot, 'report-templates', 'closing-market-report', 'styles.css'),
    mobileSelectors: ['.summary-card p', '.rich-text', '.checklist li', '.risk-list li', 'th,', 'td']
  },
  {
    name: 'morning',
    cssPath: path.join(workspaceRoot, 'report-templates', 'morning-market-report', 'styles.css'),
    mobileSelectors: ['.summary-card p', '.rich-text', '.checklist li', '.risk-list li', '.event-card p', '.signal-card p']
  },
  {
    name: 'news',
    cssPath: path.join(workspaceRoot, 'report-templates', 'news-market-report', 'styles.css'),
    mobileSelectors: ['.summary-card p', '.checklist li', '.risk-list li', '.event-card p', '.signal-card p', '.timeline-item p']
  }
];

function extractMediaBlock(css, maxWidthPx) {
  const marker = `@media (max-width: ${maxWidthPx}px)`;
  const start = css.indexOf(marker);
  assert.notEqual(start, -1, `missing ${marker} block`);

  const braceStart = css.indexOf('{', start);
  assert.notEqual(braceStart, -1, `missing opening brace for ${marker}`);

  let depth = 0;
  for (let index = braceStart; index < css.length; index += 1) {
    const char = css[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(braceStart + 1, index);
      }
    }
  }

  throw new Error(`unterminated ${marker} block`);
}

for (const template of templateChecks) {
  const css = await readFile(template.cssPath, 'utf8');

  assert.match(css, /-webkit-text-size-adjust:\s*100%/, `${template.name}: should opt into stable mobile text sizing`);
  assert.match(css, /\.table-wrap\s*\{[\s\S]*-webkit-overflow-scrolling:\s*touch;/, `${template.name}: table wrapper should support touch scrolling`);

  const phoneBlock = extractMediaBlock(css, 480);
  for (const selector of template.mobileSelectors) {
    assert.match(
      phoneBlock,
      new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${template.name}: phone breakpoint should tune ${selector}`
    );
  }

  assert.match(phoneBlock, /font-size:\s*(16|17)px/, `${template.name}: phone breakpoint should lift body copy to at least 16px`);
  assert.match(phoneBlock, /grid-template-columns:\s*1fr/, `${template.name}: phone breakpoint should collapse dense grids to one column`);

  if (template.name === 'closing') {
    assert.match(phoneBlock, /\.metric-card\s*\{[\s\S]*min-height:\s*auto;/, 'closing: phone metric cards should drop the tall desktop min-height');
    assert.match(phoneBlock, /\.metric-card\s*\{[\s\S]*gap:\s*(8|10)px;/, 'closing: phone metric cards should use tighter internal spacing');
    assert.match(phoneBlock, /\.metric-grid\s*\{[\s\S]*gap:\s*(10|12)px;/, 'closing: phone metric grid should be denser on small screens');
    assert.match(phoneBlock, /\.metric-value\s*\{[\s\S]*font-size:\s*(2[46-9]|3[0-2])px;/, 'closing: phone metric values should stay prominent');
    assert.match(phoneBlock, /\.metric-note\s*\{[\s\S]*line-height:\s*1\.[45-7]/, 'closing: phone metric note should become more compact');
  }
}

console.log('responsive-templates smoke ok');
