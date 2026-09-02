"use client";

import { useMemo, useState } from "react";

export type ServiceLogRow = {
  id: string;
  property: string;
  workArea: string;
  taskList: string;
  sequence: number;
  taskPerformed: string;
  actualTimeTaken: string;
  actualSeconds: number | null;
  scheduledTime: string;
  scheduledSeconds: number;
  deviation: string;
  deviationSeconds: number | null;
  user: string;
  date: string;
  startTime: string;
  endTime: string;
  actualStartAtEpoch: number | null;
  actualEndAtEpoch: number | null;
};

type SortKey =
  | "property"
  | "workArea"
  | "taskList"
  | "sequence"
  | "taskPerformed"
  | "actualSeconds"
  | "scheduledSeconds"
  | "deviationSeconds"
  | "user"
  | "date"
  | "startTime"
  | "endTime";

type SortDirection = "asc" | "desc";

const headers: { label: string; key: SortKey }[] = [
  { label: "Property", key: "property" },
  { label: "Work Area", key: "workArea" },
  { label: "Task List", key: "taskList" },
  { label: "Sr. No.", key: "sequence" },
  { label: "Task Performed", key: "taskPerformed" },
  { label: "Actual Time Taken", key: "actualSeconds" },
  { label: "Scheduled Time", key: "scheduledSeconds" },
  { label: "Deviation", key: "deviationSeconds" },
  { label: "User", key: "user" },
  { label: "Date", key: "date" },
  { label: "Start Time", key: "startTime" },
  { label: "End Time", key: "endTime" },
];

function sortValue(row: ServiceLogRow, key: SortKey): string | number | null {
  if (key === "date" || key === "startTime") return row.actualStartAtEpoch;
  if (key === "endTime") return row.actualEndAtEpoch;
  return row[key];
}

function compareValues(a: string | number | null, b: string | number | null) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

export function SortableServiceLogTable({ rows }: { rows: ServiceLogRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  function changeSort(key: SortKey) {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  const sortedRows = useMemo(() => {
    const copy = [...rows];
    copy.sort((left, right) => {
      const result = compareValues(sortValue(left, sortKey), sortValue(right, sortKey));
      return sortDirection === "asc" ? result : -result;
    });
    return copy;
  }, [rows, sortKey, sortDirection]);

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ overflowX: "auto" }}>
        <table className="table" style={{ minWidth: 1500 }}>
          <thead>
            <tr>
              {headers.map((header) => {
                const active = sortKey === header.key;
                const arrow = active ? (sortDirection === "asc" ? " ▲" : " ▼") : "";
                return (
                  <th key={header.key}>
                    <button
                      type="button"
                      onClick={() => changeSort(header.key)}
                      title={`Sort by ${header.label}`}
                      style={{
                        border: 0,
                        background: "transparent",
                        padding: 0,
                        color: "inherit",
                        font: "inherit",
                        fontWeight: 700,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {header.label}{arrow}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr key={row.id}>
                <td>{row.property}</td>
                <td>{row.workArea}</td>
                <td>{row.taskList}</td>
                <td>{row.sequence}</td>
                <td><strong>{row.taskPerformed}</strong></td>
                <td>{row.actualTimeTaken}</td>
                <td>{row.scheduledTime}</td>
                <td>{row.deviation}</td>
                <td>{row.user}</td>
                <td>{row.date}</td>
                <td>{row.startTime}</td>
                <td>{row.endTime}</td>
              </tr>
            ))}
            {!sortedRows.length && (
              <tr>
                <td colSpan={12} className="muted">No completed Task performances match the current filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
