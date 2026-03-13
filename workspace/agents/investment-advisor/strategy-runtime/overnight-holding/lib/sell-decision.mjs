function toMinutes(value) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) {
    throw new Error('checkpointAt must be HH:MM');
  }

  const [hours, minutes] = value.split(':').map(Number);
  return (hours * 60) + minutes;
}

function fromMinutes(totalMinutes) {
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const minutes = String(totalMinutes % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function assertCheckpoint(checkpointAt) {
  const minutes = toMinutes(checkpointAt);
  const firstCheckpoint = toMinutes('09:35');
  if (minutes < firstCheckpoint) {
    throw new Error('sell review must start after 09:35');
  }
  if ((minutes - firstCheckpoint) % 5 !== 0) {
    throw new Error('sell review checkpoints must be 5 minutes apart');
  }
  return minutes;
}

export function evaluateSellDecision({ checkpointAt, snapshot } = {}) {
  const checkpointMinutes = assertCheckpoint(checkpointAt);
  const mustExitBefore = '11:30';
  const nextCheckAt = fromMinutes(checkpointMinutes + 5);

  if (
    Number(snapshot.lastPriceChangePct) <= -1 ||
    (!snapshot.reclaimedIntradayAverage && Number(snapshot.firstPushStrength) < 40)
  ) {
    return {
      action: 'sell_now',
      confidence: 'high',
      nextCheckAt: null,
      why: ['开盘承接偏弱', '均线未能有效收复，优先兑现'],
      mustExitBefore
    };
  }

  if (
    Number(snapshot.trendQuality) >= 80 &&
    Number(snapshot.volumeConfirmation) >= 80 &&
    Number(snapshot.firstPushStrength) >= 75 &&
    Number(snapshot.lastPriceChangePct) >= 2.5
  ) {
    return {
      action: 'hold_and_recheck',
      confidence: 'medium',
      nextCheckAt,
      why: ['趋势保持单边上行', '量能确认较强，可延后一个检查点'],
      mustExitBefore
    };
  }

  return {
    action: 'sell_on_first_push',
    confidence: 'medium',
    nextCheckAt,
    why: ['走势符合预期但强度未到单边趋势', '默认在首次冲高时完成兑现'],
    mustExitBefore
  };
}
