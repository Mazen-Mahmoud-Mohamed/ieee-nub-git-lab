const cairoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const calendarDate = (instant: number) => {
  const parts = cairoDate.formatToParts(instant);
  const part = (type: string) => parts.find((value) => value.type === type)!.value;
  return part('year') + '-' + part('month') + '-' + part('day');
};
// Find the first instant of a Cairo calendar date, including DST midnight transitions.
export function cairoDayBoundary(day: string, followingDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Choose a valid calendar date.');
  let target = Date.parse(day + 'T00:00:00Z');
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== day)
    throw new Error('Choose a valid calendar date.');
  if (followingDay) target += 86400000;
  const targetDay = new Date(target).toISOString().slice(0, 10);
  let low = target - 86400000,
    high = target + 86400000;
  while (low < high) {
    const midpoint = Math.floor((low + high) / 2);
    if (calendarDate(midpoint) < targetDay) low = midpoint + 1;
    else high = midpoint;
  }
  return new Date(low).toISOString();
}
