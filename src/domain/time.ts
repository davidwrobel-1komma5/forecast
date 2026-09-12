/**
 * ISO-8601-Wochenlogik. Die Woche ist die operative Kernebene der Anwendung,
 * Monate und Quartale werden ausschliesslich daraus aggregiert.
 */

export type WeekId = string; // "2026-W37"

export interface WeekMeta {
  id: WeekId;
  year: number;
  week: number;
  start: Date;
  end: Date;
  /** Monat, dem die Woche zugeordnet ist (Donnerstagsregel nach ISO 8601). */
  monthKey: string; // "2026-03"
  label: string; // "KW 37"
  rangeLabel: string; // "08.–14. Sep"
}

const DAY = 86_400_000;

export function utc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

/** Montag der ISO-Woche, in der `date` liegt. */
export function startOfIsoWeek(date: Date): Date {
  const d = utc(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const shift = (d.getUTCDay() + 6) % 7; // Mo = 0
  return new Date(d.getTime() - shift * DAY);
}

/** Donnerstag entscheidet über Jahr und Monat der Woche. */
export function thursdayOfIsoWeek(date: Date): Date {
  return new Date(startOfIsoWeek(date).getTime() + 3 * DAY);
}

export function isoWeekNumber(date: Date): number {
  const thursday = thursdayOfIsoWeek(date);
  const firstThursday = thursdayOfIsoWeek(utc(thursday.getUTCFullYear(), 0, 4));
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * DAY));
}

export function isoWeekYear(date: Date): number {
  return thursdayOfIsoWeek(date).getUTCFullYear();
}

export function weekIdOf(date: Date): WeekId {
  return formatWeekId(isoWeekYear(date), isoWeekNumber(date));
}

export function formatWeekId(year: number, week: number): WeekId {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function parseWeekId(id: WeekId): { year: number; week: number } {
  const match = /^(\d{4})-W(\d{1,2})$/.exec(id);
  if (!match) throw new Error(`Ungültige Wochen-ID: ${id}`);
  return { year: Number(match[1]), week: Number(match[2]) };
}

/** Montag der angegebenen ISO-Woche. */
export function startOfWeekId(id: WeekId): Date {
  const { year, week } = parseWeekId(id);
  const firstThursday = thursdayOfIsoWeek(utc(year, 0, 4));
  const monday = new Date(firstThursday.getTime() - 3 * DAY);
  return new Date(monday.getTime() + (week - 1) * 7 * DAY);
}

const MONTHS_SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTHS_LONG = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember"
];

export function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

export function monthShortLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return `${MONTHS_SHORT[month - 1]} ${String(year).slice(2)}`;
}

export function weekMeta(id: WeekId): WeekMeta {
  const { year, week } = parseWeekId(id);
  const start = startOfWeekId(id);
  const end = new Date(start.getTime() + 6 * DAY);
  const thursday = new Date(start.getTime() + 3 * DAY);
  const monthKey = `${thursday.getUTCFullYear()}-${String(thursday.getUTCMonth() + 1).padStart(2, "0")}`;
  const pad = (n: number) => String(n).padStart(2, "0");
  const rangeLabel =
    start.getUTCMonth() === end.getUTCMonth()
      ? `${pad(start.getUTCDate())}.–${pad(end.getUTCDate())}. ${MONTHS_SHORT[end.getUTCMonth()]}`
      : `${pad(start.getUTCDate())}. ${MONTHS_SHORT[start.getUTCMonth()]} – ${pad(end.getUTCDate())}. ${MONTHS_SHORT[end.getUTCMonth()]}`;

  return { id, year, week, start, end, monthKey, label: `KW ${week}`, rangeLabel };
}

/** Verschiebt eine Wochen-ID um `delta` Wochen (auch über Jahresgrenzen). */
export function shiftWeek(id: WeekId, delta: number): WeekId {
  return weekIdOf(new Date(startOfWeekId(id).getTime() + delta * 7 * DAY));
}

/** Fortlaufende Wochenliste von `from` bis einschliesslich `to`. */
export function weekRange(from: WeekId, to: WeekId): WeekId[] {
  const out: WeekId[] = [];
  let cursor = from;
  const limit = startOfWeekId(to).getTime();
  // Sicherheitsgrenze gegen falsch herum übergebene Grenzen.
  for (let i = 0; i < 520 && startOfWeekId(cursor).getTime() <= limit; i += 1) {
    out.push(cursor);
    cursor = shiftWeek(cursor, 1);
  }
  return out;
}

export function weeksOfMonth(monthKey: string): WeekId[] {
  const [year, month] = monthKey.split("-").map(Number);
  const first = weekIdOf(utc(year, month - 1, 1));
  const last = weekIdOf(utc(year, month, 0));
  return weekRange(first, last).filter((id) => weekMeta(id).monthKey === monthKey);
}

/** Arbeitstage (Mo–Fr) einer ISO-Woche, die in den zugeordneten Monat fallen. */
export function defaultWorkingDays(): number {
  return 5;
}

export function todayWeekId(now: Date = new Date()): WeekId {
  return weekIdOf(now);
}
