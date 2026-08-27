"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type WorkAreaOption = {
  id: string;
  name: string;
  propertyName: string;
  timezone: string;
  status: string;
  propertyStatus: string;
};

type TaskOption = {
  id: string;
  name: string;
  status: string;
};

type ScheduleItem = {
  id?: string;
  taskId: string;
  taskName: string;
  duration: string;
  evidenceRule: "NONE" | "PHOTO" | "VIDEO" | "RANDOM";
  randomEveryN: number;
  randomEvidenceType: "PHOTO" | "VIDEO" | "EITHER";
};

type InitialSchedule = {
  id: string;
  name: string;
  frequencyType: "ONE_TIME" | "RECURRING";
  recurrenceUnit: "MINUTE" | "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR" | null;
  recurrenceInterval: number | null;
  recurrenceConfig: { weekdays?: number[]; monthDays?: number[] } | null;
  startLocal: string;
  timezone: string;
  endDate: string | null;
  workAreaId: string;
  status: string;
  items: ScheduleItem[];
};

function durationMinutes(value: string) {
  if (!/^\d{2}:[0-5]\d$/.test(value)) return null;
  const [h, m] = value.split(":").map(Number);
  const total = h * 60 + m;
  return total > 0 ? total : null;
}

function formatClock(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function addMinutes(local: string, minutes: number) {
  if (!local) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!match) return "";
  const [, y, m, d, h, min] = match;
  const value = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h), Number(min) + minutes));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

const DAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" }
];

export function ScheduleEditor({
  canManage,
  workAreas,
  tasks,
  initial
}: {
  canManage: boolean;
  workAreas: WorkAreaOption[];
  tasks: TaskOption[];
  initial?: InitialSchedule;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [frequencyType, setFrequencyType] = useState<"ONE_TIME" | "RECURRING">(initial?.frequencyType ?? "ONE_TIME");
  const [recurrenceUnit, setRecurrenceUnit] = useState<"MINUTE" | "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR">(initial?.recurrenceUnit ?? "DAY");
  const [recurrenceInterval, setRecurrenceInterval] = useState(initial?.recurrenceInterval ?? 1);
  const [weekdays, setWeekdays] = useState<number[]>(initial?.recurrenceConfig?.weekdays ?? []);
  const [monthDays, setMonthDays] = useState((initial?.recurrenceConfig?.monthDays ?? []).join(", "));
  const [workAreaId, setWorkAreaId] = useState(initial?.workAreaId ?? (workAreas.find((w) => w.status === "ACTIVE" && w.propertyStatus === "ACTIVE")?.id ?? ""));
  const selectedWorkArea = workAreas.find((w) => w.id === workAreaId);
  const [startLocal, setStartLocal] = useState(initial?.startLocal ?? "");
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [items, setItems] = useState<ScheduleItem[]>(initial?.items ?? []);
  const [taskToAdd, setTaskToAdd] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const timeline = useMemo(() => {
    let cursor = 0;
    return items.map((item) => {
      const mins = durationMinutes(item.duration) ?? 0;
      const start = cursor;
      cursor += mins;
      return { start, end: cursor, valid: mins > 0 };
    });
  }, [items]);

  const totalMinutes = timeline.length ? timeline[timeline.length - 1].end : 0;

  function addTask() {
    const task = tasks.find((t) => t.id === taskToAdd);
    if (!task || task.status !== "ACTIVE") return;
    setItems((current) => [...current, {
      taskId: task.id,
      taskName: task.name,
      duration: "00:30",
      evidenceRule: "NONE",
      randomEveryN: 3,
      randomEvidenceType: "EITHER"
    }]);
    setTaskToAdd("");
  }

  function updateItem(index: number, patch: Partial<ScheduleItem>) {
    setItems((current) => current.map((item, i) => i === index ? { ...item, ...patch } : item));
  }

  function move(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= items.length) return;
    setItems((current) => {
      const copy = [...current];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }

  function remove(index: number) {
    setItems((current) => current.filter((_, i) => i !== index));
  }

  function toggleWeekday(day: number) {
    setWeekdays((current) => current.includes(day) ? current.filter((x) => x !== day) : [...current, day].sort());
  }

  async function save() {
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      if (!name.trim()) throw new Error("Schedule Name is required.");
      if (!workAreaId) throw new Error("Please select a Work Area.");
      if (!startLocal) throw new Error("Schedule Start date/time is required.");
      if (!items.length) throw new Error("Add at least one Task to the Schedule.");
      if (items.some((item) => durationMinutes(item.duration) === null)) throw new Error("Every Task duration must use HH:MM format and be greater than 00:00.");
      if (items.some((item) => item.evidenceRule === "RANDOM" && (!Number.isInteger(item.randomEveryN) || item.randomEveryN < 2))) {
        throw new Error("Random evidence frequency must be at least 1 in 2 performances.");
      }

      let recurrenceConfig: { weekdays?: number[]; monthDays?: number[] } | null = null;
      if (frequencyType === "RECURRING" && recurrenceUnit === "WEEK") recurrenceConfig = { weekdays };
      if (frequencyType === "RECURRING" && recurrenceUnit === "MONTH") {
        const parsed = monthDays.split(",").map((x) => Number(x.trim())).filter((x) => Number.isInteger(x) && x >= 1 && x <= 31);
        if (!parsed.length) throw new Error("Enter at least one valid monthly day (1-31).");
        recurrenceConfig = { monthDays: Array.from(new Set(parsed)).sort((a, b) => a - b) };
      }

      const payload = {
        name: name.trim(),
        frequencyType,
        recurrenceUnit: frequencyType === "RECURRING" ? recurrenceUnit : null,
        recurrenceInterval: frequencyType === "RECURRING" ? Number(recurrenceInterval) : null,
        recurrenceConfig,
        startLocal,
        endDate: frequencyType === "RECURRING" ? (endDate || null) : null,
        timezone: selectedWorkArea?.timezone || initial?.timezone || "UTC",
        workAreaId,
        tasks: items.map((item, index) => ({
          taskId: item.taskId,
          sequence: index + 1,
          duration: item.duration,
          evidenceRule: item.evidenceRule,
          randomEveryN: item.evidenceRule === "RANDOM" ? item.randomEveryN : null,
          randomEvidenceType: item.evidenceRule === "RANDOM" ? item.randomEvidenceType : null
        }))
      };

      const endpoint = initial ? `/api/schedules/${initial.id}` : "/api/schedules";
      const method = initial ? "PATCH" : "POST";
      const r = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to save Schedule.");
      if (initial) router.refresh();
      else router.push(`/schedules/${data.schedule.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save Schedule.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!initial || !canManage) return;
    const next = initial.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const r = await fetch(`/api/schedules/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next })
    });
    const data = await r.json();
    if (!r.ok) setError(data.error || "Unable to update Schedule status.");
    else router.refresh();
  }

  async function duplicate() {
    if (!initial || !canManage) return;
    const r = await fetch(`/api/schedules/${initial.id}/duplicate`, { method: "POST" });
    const data = await r.json();
    if (!r.ok) setError(data.error || "Unable to duplicate Schedule.");
    else router.push(`/schedules/${data.schedule.id}`);
  }

  const activeTasks = tasks.filter((t) => t.status === "ACTIVE");
  const isExisting = Boolean(initial);

  return <div className="scheduleEditor">
    <div className="card">
      <div className="formGrid">
        <label>Schedule Name
          <textarea rows={2} maxLength={500} value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} />
        </label>
        <label>Work Area
          <select value={workAreaId} onChange={(e) => setWorkAreaId(e.target.value)} disabled={!canManage}>
            <option value="">Select Work Area</option>
            {workAreas.map((wa) => {
              const selectable = wa.status === "ACTIVE" && wa.propertyStatus === "ACTIVE";
              const retained = initial?.workAreaId === wa.id;
              if (!selectable && !retained) return null;
              return <option key={wa.id} value={wa.id}>{wa.name} — {wa.propertyName}{selectable ? "" : " (Inactive)"}</option>;
            })}
          </select>
          <small className="muted">Parent Property is always shown with the Work Area.</small>
        </label>
        <label>Schedule Type
          <select value={frequencyType} onChange={(e) => setFrequencyType(e.target.value as "ONE_TIME" | "RECURRING")} disabled={!canManage}>
            <option value="ONE_TIME">One Time</option>
            <option value="RECURRING">Recurring</option>
          </select>
        </label>
        <label>Schedule Start Date / Time
          <input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} disabled={!canManage} />
          <small className="muted">Time zone: {selectedWorkArea?.timezone || initial?.timezone || "UTC"}</small>
        </label>
        {frequencyType === "RECURRING" && <label>Schedule End Date (optional)<input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!canManage}/><small className="muted">If entered, the recurring Schedule remains eligible through 11:59 PM on this date in the Work Area time zone.</small></label>}
      </div>

      {frequencyType === "RECURRING" && <div className="recurrenceBox">
        <h3>Recurrence</h3>
        <div className="row wrap">
          <span>Every</span>
          <input className="numberInput" type="number" min={1} max={100000} value={recurrenceInterval} onChange={(e) => setRecurrenceInterval(Number(e.target.value))} disabled={!canManage} />
          <select value={recurrenceUnit} onChange={(e) => setRecurrenceUnit(e.target.value as any)} disabled={!canManage}>
            <option value="MINUTE">Minute(s)</option>
            <option value="HOUR">Hour(s)</option>
            <option value="DAY">Day(s)</option>
            <option value="WEEK">Week(s)</option>
            <option value="MONTH">Month(s)</option>
            <option value="YEAR">Year(s)</option>
          </select>
        </div>
        {recurrenceUnit === "WEEK" && <div style={{ marginTop: 12 }}>
          <strong>On days:</strong>
          <div className="weekdayRow">{DAYS.map((d) => <label className="checkLabel" key={d.value}><input type="checkbox" checked={weekdays.includes(d.value)} onChange={() => toggleWeekday(d.value)} disabled={!canManage}/>{d.label}</label>)}</div>
          <small className="muted">If no day is selected, the weekday of the Schedule Start is used.</small>
        </div>}
        {recurrenceUnit === "MONTH" && <label style={{ maxWidth: 440 }}>Day(s) of month
          <input value={monthDays} onChange={(e) => setMonthDays(e.target.value)} placeholder="1, 15, 30" disabled={!canManage} />
          <small className="muted">Enter one or more calendar days from 1 to 31, separated by commas.</small>
        </label>}
      </div>}

      {error && <p className="error">{error}</p>}
    </div>

    <div className="row" style={{ marginTop: 24 }}>
      <div style={{ marginRight: "auto" }}>
        <h2>Schedule Tasks</h2>
        <p className="muted">Tasks execute in the sequence shown below. Times recalculate immediately when duration or order changes.</p>
      </div>
      {canManage && <div className="row wrap">
        <select value={taskToAdd} onChange={(e) => setTaskToAdd(e.target.value)}>
          <option value="">Choose Task</option>
          {activeTasks.map((task) => <option key={task.id} value={task.id}>{task.name}</option>)}
        </select>
        <button type="button" className="button" onClick={addTask} disabled={!taskToAdd}>Add Task</button>
      </div>}
    </div>

    <div className="card scheduleTaskTable">
      <table className="table">
        <thead><tr><th>#</th><th>Task</th><th>Duration HH:MM</th><th>Task Start</th><th>Task End</th><th>Evidence</th>{canManage && <th>Order</th>}</tr></thead>
        <tbody>
          {items.map((item, index) => {
            const line = timeline[index];
            return <tr key={`${item.taskId}-${index}`}>
              <td>{index + 1}</td>
              <td style={{ minWidth: 240 }}><strong>{item.taskName}</strong></td>
              <td><input className="durationInput" value={item.duration} onChange={(e) => updateItem(index, { duration: e.target.value })} placeholder="00:30" disabled={!canManage}/>{!line.valid && <small className="fieldError">Use HH:MM</small>}</td>
              <td>{startLocal && line.valid ? addMinutes(startLocal, line.start) : "—"}</td>
              <td>{startLocal && line.valid ? addMinutes(startLocal, line.end) : "—"}</td>
              <td style={{ minWidth: 220 }}>
                <select value={item.evidenceRule} onChange={(e) => updateItem(index, { evidenceRule: e.target.value as any })} disabled={!canManage}>
                  <option value="NONE">No Evidence</option>
                  <option value="PHOTO">Photo — Every Performance</option>
                  <option value="VIDEO">Video — Every Performance</option>
                  <option value="RANDOM">Random Evidence</option>
                </select>
                {item.evidenceRule === "RANDOM" && <div className="randomEvidence">
                  <span>Require 1 in every</span>
                  <input type="number" min={2} max={1000} value={item.randomEveryN} onChange={(e) => updateItem(index, { randomEveryN: Number(e.target.value) })} disabled={!canManage}/>
                  <span>performances</span>
                  <select value={item.randomEvidenceType} onChange={(e) => updateItem(index, { randomEvidenceType: e.target.value as any })} disabled={!canManage}>
                    <option value="PHOTO">Photo</option>
                    <option value="VIDEO">Video</option>
                    <option value="EITHER">Photo or Video</option>
                  </select>
                </div>}
              </td>
              {canManage && <td><div className="row compact">
                <button type="button" className="button small secondary" onClick={() => move(index, -1)} disabled={index === 0}>↑</button>
                <button type="button" className="button small secondary" onClick={() => move(index, 1)} disabled={index === items.length - 1}>↓</button>
                <button type="button" className="button small danger" onClick={() => remove(index)}>Remove</button>
              </div></td>}
            </tr>;
          })}
          {!items.length && <tr><td colSpan={canManage ? 7 : 6} className="muted">No Tasks have been added to this Schedule.</td></tr>}
        </tbody>
      </table>
    </div>

    <div className="scheduleSummary">
      <div><strong>Total Planned Duration</strong><span>{String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:{String(totalMinutes % 60).padStart(2, "0")}</span></div>
      <div><strong>Schedule End</strong><span>{startLocal && totalMinutes ? addMinutes(startLocal, totalMinutes) : "—"}</span></div>
    </div>

    {canManage && <div className="row wrap" style={{ marginTop: 20 }}>
      <button type="button" className="button" onClick={save} disabled={saving}>{saving ? "Saving..." : isExisting ? "Save Schedule" : "Create Schedule"}</button>
      {initial && <button type="button" className="button secondary" onClick={toggleStatus}>{initial.status === "ACTIVE" ? "Inactivate Schedule" : "Reactivate Schedule"}</button>}
      {initial && <button type="button" className="button secondary" onClick={duplicate}>Duplicate Schedule</button>}
    </div>}
  </div>;
}
