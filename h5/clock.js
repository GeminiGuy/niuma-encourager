(function () {
  'use strict';

  const minute = 60000;
  const defaults = {
    salary: 8000, payDays: 21.75, start: '09:00', end: '18:00',
    breakEnabled: true, breakStart: '12:00', breakEnd: '13:00',
    days: [1, 2, 3, 4, 5], coffee: 15, lunch: 35, reminder: 45
  };

  function timeMinutes(value) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return NaN;
    const parts = value.split(':').map(Number);
    return parts[0] * 60 + parts[1];
  }

  function schedule(settings) {
    const start = timeMinutes(settings.start);
    let end = timeMinutes(settings.end);
    if (end < start) end += 1440;
    let restStart = timeMinutes(settings.breakStart);
    let restEnd = timeMinutes(settings.breakEnd);
    if (restStart < start) restStart += 1440;
    if (restEnd < start) restEnd += 1440;
    return { start, end, restStart, restEnd };
  }

  function validate(settings) {
    const times = schedule(settings);
    if (!Number.isFinite(settings.salary) || settings.salary < 0 || settings.salary > 100000000) return '请填写有效月薪。';
    if (!Number.isFinite(settings.payDays) || settings.payDays < 1 || settings.payDays > 31) return '月计薪天数须在 1 到 31 天之间。';
    if (!(times.end > times.start)) return '上班和下班时间需不同。';
    if (!Array.isArray(settings.days) || !settings.days.length ||
        !settings.days.every(day => Number.isInteger(day) && day >= 0 && day <= 6)) return '至少选择一个排班日。';
    if (settings.breakEnabled && !(times.restStart >= times.start &&
        times.restEnd <= times.end && times.restEnd > times.restStart &&
        times.restEnd - times.restStart < times.end - times.start)) return '休息须在班次内，并保留有效计薪工时。';
    if (![settings.coffee, settings.lunch].every(price => Number.isFinite(price) && price >= 0.01 && price <= 100000)) return '咖啡和午饭价格须大于 0。';
    if (![0, 15, 30, 45, 60, 90].includes(settings.reminder)) return '请选择有效的提醒间隔。';
    return '';
  }

  function dateAt(date, dayOffset, minutes) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayOffset, 0, minutes).getTime();
  }

  function shiftAt(date, offset, settings, times) {
    const start = dateAt(date, offset, times.start);
    if (!settings.days.includes(new Date(dateAt(date, offset, 720)).getDay())) return null;
    const end = dateAt(date, offset, times.end);
    const restStart = settings.breakEnabled ? Math.max(start, dateAt(date, offset, times.restStart)) : end;
    const restEnd = settings.breakEnabled ? Math.min(end, dateAt(date, offset, times.restEnd)) : end;
    const paid = end - start - Math.max(0, restEnd - restStart);
    return { start, end, restStart, restEnd, paid };
  }

  function getState(date, settings) {
    const now = date.getTime();
    const times = schedule(settings);
    const previous = shiftAt(date, -1, settings, times);
    const shift = previous && now < previous.end ? previous : shiftAt(date, 0, settings, times);
    const daily = settings.salary / settings.payDays;
    if (!shift || !(shift.paid > 0)) {
      for (let offset = 1; offset <= 7; offset += 1) {
        const next = shiftAt(date, offset, settings, times);
        if (next && next.paid > 0) return { phase: 'off', next: next.start, earned: 0, progress: 0, worked: 0, rate: 0 };
      }
    }
    const bounded = Math.min(shift.end, Math.max(now, shift.start));
    const paused = Math.max(0, Math.min(bounded, shift.restEnd) - shift.restStart);
    const worked = Math.max(0, bounded - shift.start - paused);
    let phase = 'work';
    if (now < shift.start) phase = 'before';
    else if (now >= shift.end) phase = 'done';
    else if (shift.restEnd > shift.restStart && now >= shift.restStart && now < shift.restEnd) phase = 'rest';

    const progress = worked / shift.paid;
    return {
      phase, shift, worked, progress, earned: daily * progress,
      rate: daily / (shift.paid / 1000), hasRest: shift.restEnd > shift.restStart
    };
  }

  function duration(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600);
    const clock = [hours % 24, Math.floor(total / 60) % 60, total % 60]
      .map(part => String(part).padStart(2, '0')).join(':');
    return hours >= 24 ? Math.floor(hours / 24) + '天 ' + clock : clock;
  }

  window.NiumaClock = { defaults, validate, getState, duration, minute };
}());
