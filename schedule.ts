export type FrequencyType = "ONE_TIME" | "RECURRING";
export type RecurrenceUnit = "MINUTE" | "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR";

export function durationToMinutes(value: string) {
  if (!/^\d{2}:[0-5]\d$/.test(value)) throw new Error("Duration must use HH:MM format.");
  const [hours, minutes] = value.split(":").map(Number);
  const total = hours * 60 + minutes;
  if (total <= 0) throw new Error("Task duration must be greater than 00:00.");
  return total;
}

export function minutesToDuration(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function buildOffsets(durations: number[]) {
  let cursor = 0;
  return durations.map((durationMinutes) => {
    const plannedStartOffsetMinutes = cursor;
    cursor += durationMinutes;
    return {
      plannedStartOffsetMinutes,
      plannedEndOffsetMinutes: cursor,
      durationMinutes
    };
  });
}

export function recurrenceLabel(input: {
  frequencyType: FrequencyType;
  recurrenceUnit?: RecurrenceUnit | null;
  recurrenceInterval?: number | null;
  recurrenceConfig?: unknown;
}) {
  if (input.frequencyType === "ONE_TIME") return "One time";
  const n = input.recurrenceInterval ?? 1;
  const unit = (input.recurrenceUnit ?? "DAY").toLowerCase();
  let label = `Every ${n === 1 ? "" : `${n} `}${n === 1 ? unit : `${unit}s`}`.replace("Every 1 ", "Every ");
  const cfg = (input.recurrenceConfig ?? {}) as { weekdays?: number[]; monthDays?: number[] };
  if (input.recurrenceUnit === "WEEK" && cfg.weekdays?.length) {
    const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    label += ` on ${cfg.weekdays.map((d) => names[d]).join(", ")}`;
  }
  if (input.recurrenceUnit === "MONTH" && cfg.monthDays?.length) {
    label += ` on day${cfg.monthDays.length > 1 ? "s" : ""} ${cfg.monthDays.join(", ")}`;
  }
  return label;
}

export function zonedLocalToUtc(localDateTime: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localDateTime);
  if (!match) throw new Error("Invalid Schedule Start date/time.");
  const [, ys, ms, ds, hs, mins] = match;
  const targetAsUtc = Date.UTC(Number(ys), Number(ms) - 1, Number(ds), Number(hs), Number(mins), 0);
  let guess = targetAsUtc;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  for (let i = 0; i < 3; i += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((p) => [p.type, p.value]));
    const representedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    guess += targetAsUtc - representedAsUtc;
  }

  return new Date(guess);
}

export function formatInZone(date: Date | string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}
