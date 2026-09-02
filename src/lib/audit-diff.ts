export type JsonRecord = Record<string, unknown>;

export type AuditDiff = {
  oldValue: JsonRecord | null;
  newValue: JsonRecord | null;
};

export function auditDiff(
  before: JsonRecord | null,
  after: JsonRecord | null,
): AuditDiff {
  if (before === null || after === null) {
    return { oldValue: before, newValue: after };
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const oldValue: JsonRecord = {};
  const newValue: JsonRecord = {};

  for (const key of keys) {
    const oldSerialized = JSON.stringify(before[key]);
    const newSerialized = JSON.stringify(after[key]);

    if (oldSerialized !== newSerialized) {
      oldValue[key] = before[key] ?? null;
      newValue[key] = after[key] ?? null;
    }
  }

  return { oldValue, newValue };
}
