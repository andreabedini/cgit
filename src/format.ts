export function abbrevOid(oid: string): string {
  return oid.slice(0, 10);
}

const UNITS: [label: string, seconds: number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export function formatAge(when: Date, now: Date = new Date()): string {
  const secs = Math.max(0, Math.floor((now.getTime() - when.getTime()) / 1000));
  for (const [label, unitSecs] of UNITS) {
    const n = Math.floor(secs / unitSecs);
    if (n >= 1) return `${n} ${label}${n === 1 ? "" : "s"} ago`;
  }
  return "just now";
}
