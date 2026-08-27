export type WorkingWindow = { start: string; end: string };
export type WorkingHours = { days: Record<string, WorkingWindow[]> };

export const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function isWorkingHours(value: unknown): value is WorkingHours {
  if (!value || typeof value !== "object") return false;
  const days = (value as { days?: unknown }).days;
  if (!days || typeof days !== "object") return false;
  for (const [key, windows] of Object.entries(days as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(key) || !Array.isArray(windows)) return false;
    for (const window of windows) {
      if (!window || typeof window !== "object") return false;
      const start = String((window as any).start ?? "");
      const end = String((window as any).end ?? "");
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start === end) return false;
    }
  }
  return true;
}

export function normalizeWorkingHours(value: unknown): WorkingHours | null {
  if (value === null || value === undefined) return null;
  if (!isWorkingHours(value)) throw new Error("Invalid working-hours definition.");
  const result: WorkingHours = { days: {} };
  for (let day = 0; day < 7; day += 1) {
    const windows = value.days[String(day)] ?? [];
    result.days[String(day)] = windows.map((w) => ({ start: w.start, end: w.end }));
  }
  return result;
}

export function effectiveWorkingHours(workArea: unknown, property: unknown, organization: unknown): WorkingHours | null {
  return normalizeWorkingHours(workArea) ?? normalizeWorkingHours(property) ?? normalizeWorkingHours(organization);
}

function toMinute(value: string) {
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

export function scheduleFitsWorkingHours(hours: WorkingHours | null, localStart: Date, durationMinutes: number) {
  if (!hours) return true; // null at the Organization level means unrestricted / 24x7.
  const day = localStart.getUTCDay();
  const startMinute = localStart.getUTCHours() * 60 + localStart.getUTCMinutes();
  const endMinute = startMinute + durationMinutes;
  const windowsToday = hours.days[String(day)] ?? [];

  for (const window of windowsToday) {
    const open = toMinute(window.start);
    const close = toMinute(window.end);
    if (close > open) {
      if (startMinute >= open && endMinute <= close) return true;
    } else {
      // Overnight window (for example 22:00-06:00).
      if (startMinute >= open && endMinute <= close + 1440) return true;
    }
  }

  // An overnight window that started the previous day can also contain the candidate.
  const previousDay = (day + 6) % 7;
  for (const window of hours.days[String(previousDay)] ?? []) {
    const open = toMinute(window.start);
    const close = toMinute(window.end);
    if (close < open) {
      const shiftedStart = startMinute + 1440;
      if (shiftedStart >= open && shiftedStart + durationMinutes <= close + 1440) return true;
    }
  }
  return false;
}
