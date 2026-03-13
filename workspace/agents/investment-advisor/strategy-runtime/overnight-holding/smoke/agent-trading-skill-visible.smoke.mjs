import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const { stdout } = await execFile('openclaw', [
  'agent',
  '--agent', 'investment-advisor',
  '--json',
  '--thinking', 'minimal',
  '--timeout', '120',
  '--message', '不要使用任何工具。只回答一个 JSON 对象：{"seenSkills":"<comma-separated skill names you can use>"}。'
], {
  cwd: '/Users/zcg/.openclaw'
});

const result = JSON.parse(stdout);
const text = result.result.payloads[0].text;
const seenSkills = JSON.parse(text).seenSkills;

assert.match(seenSkills, /trading/);
assert.ok(
  result.result.meta.systemPromptReport.skills.entries.some((entry) => entry.name === 'trading')
);

console.log('agent-trading-skill-visible smoke ok');
