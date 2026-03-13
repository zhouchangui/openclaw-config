import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createAuditStore } from '../lib/audit-store.mjs';
import { parseCliArgs, printJson } from '../lib/io.mjs';
import { createStateStore } from '../lib/state-store.mjs';

function resolveDefaultWorkspaceRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
}

function buildSummary(action, state) {
  if (action === 'status') {
    return [
      '隔日持股策略状态',
      `结论：策略当前${state.status.enabled ? '已启用' : '已暂停'}。`,
      `状态：stoppedBy=${state.status.stoppedBy || 'none'} / resumeRequired=${state.status.resumeRequired ? 'yes' : 'no'}`
    ].join('\n');
  }

  if (action === 'stop') {
    return [
      '隔日持股策略状态',
      '结论：已按用户要求暂停后续执行。',
      '后续恢复前，会先通过飞书再次确认。'
    ].join('\n');
  }

  if (action === 'resume-request') {
    return [
      '隔日持股策略恢复确认',
      '结论：行情已满足重新观察条件，但不会自动恢复执行。',
      '请直接在飞书回复是否恢复策略。'
    ].join('\n');
  }

  return [
    '隔日持股策略状态',
    '结论：已恢复策略，后续可重新执行虚拟买入。',
    '请继续关注 14:30 选股结果与次日卖出复盘。'
  ].join('\n');
}

const args = parseCliArgs();
const action = args.action || 'status';
const workspaceRoot = args.workspaceRoot || resolveDefaultWorkspaceRoot();
const tradingDate = args.tradingDate;
const reason = args.reason || null;

if (!['status', 'stop', 'resume-request', 'resume'].includes(action)) {
  printJson({
    ok: false,
    phase: 'control',
    issues: ['action must be status, stop, resume-request, or resume']
  });
  process.exitCode = 1;
} else {
  const store = createStateStore({ workspaceRoot });
  const auditStore = createAuditStore({ workspaceRoot });
  let state;

  if (action === 'status') {
    state = await store.loadState();
  } else if (action === 'stop') {
    state = await store.pauseByUser({
      tradingDate,
      reason: reason || 'manual_stop'
    });
  } else if (action === 'resume-request') {
    state = await store.requestResume({
      tradingDate,
      reason: reason || 'market_recovered'
    });
  } else {
    state = await store.resume({
      tradingDate,
      reason: reason || 'user_confirmed'
    });
  }

  await auditStore.recordControlAudit({
    tradingDate,
    action,
    status: state.status,
    messageSummary: buildSummary(action, state),
    userCommunications: action === 'resume-request'
      ? [{
        type: 'resume_request',
        channel: 'feishu',
        deliveryStatus: 'pending_external_delivery'
      }]
      : []
  });

  printJson({
    ok: true,
    phase: 'control',
    action,
    tradingDate,
    status: state.status,
    messageSummary: buildSummary(action, state)
  });
}
