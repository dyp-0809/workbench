function validTime(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function nextOccurrence(fromAt, intervalValue, intervalUnit) {
  const date = validTime(fromAt);
  if (!date) throw new Error('起始时间无效。');
  const value = Number(intervalValue);
  if (!Number.isInteger(value) || value < 1) throw new Error('周期数值无效。');
  switch (intervalUnit) {
    case 'day': date.setDate(date.getDate() + value); break;
    case 'week': date.setDate(date.getDate() + value * 7); break;
    case 'month': {
      const day = date.getDate();
      date.setDate(1);
      date.setMonth(date.getMonth() + value);
      const lastDay = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0)).getUTCDate();
      date.setDate(Math.min(day, lastDay));
      break;
    }
    case 'year': date.setFullYear(date.getFullYear() + value); break;
    default: throw new Error('周期单位无效。');
  }
  return date.toISOString();
}

function advanceFrom(at, advanceValue, advanceUnit) {
  const date = validTime(at);
  if (!date) throw new Error('时间无效。');
  const value = Number(advanceValue);
  if (!Number.isInteger(value) || value < 0) throw new Error('提前量数值无效。');
  switch (advanceUnit) {
    case 'minute': date.setMinutes(date.getMinutes() - value); break;
    case 'hour': date.setHours(date.getHours() - value); break;
    case 'day': date.setDate(date.getDate() - value); break;
    default: throw new Error('提前量单位无效。');
  }
  return date.toISOString();
}

module.exports = { advanceFrom, nextOccurrence };
