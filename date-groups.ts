/** Calendar-day buckets in the client's timezone, unaffected by DST day length. */
export function dateGroup(timestamp: number, now = new Date()): string {
  const date = new Date(timestamp);
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const age = Math.max(0, Math.round((day(now) - day(date)) / 86400000));
  if (age === 0) return 'Today';
  if (age === 1) return 'Yesterday';
  if (age < 7) return 'Previous 7 Days';
  if (age < 30) return 'Previous 30 Days';
  return 'Older';
}
