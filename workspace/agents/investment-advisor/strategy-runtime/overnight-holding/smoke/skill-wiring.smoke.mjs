import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const runtimeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const agentRoot = path.resolve(runtimeRoot, '..', '..');

const skillDoc = await readFile(path.join(agentRoot, 'skills', 'trading', 'SKILL.md'), 'utf8');
const agentsDoc = await readFile(path.join(agentRoot, 'AGENTS.md'), 'utf8');
const skillsReadme = await readFile(path.join(agentRoot, 'skills', 'README.md'), 'utf8');
const taskWiring = await readFile(path.join(agentRoot, 'report-specs', 'task-wiring.md'), 'utf8');
const cronJobs = await readFile(path.resolve(agentRoot, '..', '..', '..', 'cron', 'jobs.json'), 'utf8');

assert.match(skillDoc, /run-selection\.mjs/);
assert.match(skillDoc, /run-sell-review\.mjs/);
assert.match(skillDoc, /buy/);
assert.match(skillDoc, /sell-review/);
assert.match(skillDoc, /status/);
assert.match(skillDoc, /stop/);
assert.match(skillDoc, /resume-request/);
assert.match(skillDoc, /daily-report/);
assert.match(skillDoc, /weekly-report/);
assert.match(skillDoc, /run-audit-report\.mjs/);
assert.match(skillDoc, /虚拟买入/);
assert.match(skillDoc, /禁止真实下单|禁止真实交易/);

assert.match(agentsDoc, /trading/);
assert.match(skillsReadme, /trading/);
assert.match(skillsReadme, /daily-report/);

assert.match(taskWiring, /14:30/);
assert.match(taskWiring, /09:35/);
assert.match(taskWiring, /用户停用|用户暂停/);
assert.match(taskWiring, /市场.*停止|market/i);
assert.match(taskWiring, /飞书/);
assert.match(taskWiring, /resume|恢复/);
assert.match(taskWiring, /run-audit-report\.mjs/);

assert.match(cronJobs, /隔日持股/);
assert.match(cronJobs, /14:30/);
assert.match(cronJobs, /sell-review|卖出复盘/);

console.log('skill-wiring smoke ok');
