"use client";

import { useState } from "react";

type Result = {
  organization: { id: string; name: string; timezone: string };
  counts: { users: number; properties: number; workAreas: number; tasks: number; schedules: number };
  occurrences: { created: number; skippedOutsideWorkingHours: number };
  loginEmails: readonly string[];
};

export function DemoDataManager({
  initialExists,
  initialCounts
}: {
  initialExists: boolean;
  initialCounts: { users: number; properties: number; workAreas: number; tasks: number; schedules: number } | null;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  async function populate() {
    setRunning(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/admin/demo-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: confirmation })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to populate demo data.");
      setResult(data);
      setConfirmation("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to populate demo data.");
    } finally {
      setRunning(false);
    }
  }

  const counts = result?.counts ?? initialCounts;

  return <div className="demoDataPage">
    <div className="card">
      <h2>Canonical Demo Dataset</h2>
      <p>
        This staging utility creates or refreshes the fixed <strong>eDekhbhal Demo Operations</strong> dataset
        in Supabase using the Vercel application's existing database connection.
      </p>

      <div className="demoStats">
        <div><strong>Organization</strong><span>1</span></div>
        <div><strong>Users</strong><span>{counts?.users ?? 6}</span></div>
        <div><strong>Properties</strong><span>{counts?.properties ?? 3}</span></div>
        <div><strong>Work Areas</strong><span>{counts?.workAreas ?? 10}</span></div>
        <div><strong>Tasks</strong><span>{counts?.tasks ?? 15}</span></div>
        <div><strong>Schedules</strong><span>{counts?.schedules ?? 8}</span></div>
      </div>

      <div className="notice warning">
        <strong>{initialExists ? "Refresh behavior" : "Populate behavior"}</strong>
        <p>
          Only records with the canonical demo IDs are refreshed. Unrelated Organizations are untouched.
          Future <code>PENDING</code> occurrences for the eight demo Schedules are reconciled; historical,
          in-progress and completed execution records are preserved.
        </p>
      </div>

      <label>
        Type <strong>POPULATE</strong> to enable the button
        <input
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="POPULATE"
          autoComplete="off"
        />
      </label>

      <button
        type="button"
        className="button"
        onClick={populate}
        disabled={running || confirmation !== "POPULATE"}
      >
        {running ? "Populating Demo Data..." : initialExists ? "Refresh Demo Data" : "Populate Demo Data"}
      </button>

      {error && <p className="error">{error}</p>}

      {result && <div className="notice success" style={{ marginTop: 18 }}>
        <strong>Demo data is ready.</strong>
        <p>
          Generated {result.occurrences.created} upcoming occurrence(s).
          {result.occurrences.skippedOutsideWorkingHours > 0
            ? ` ${result.occurrences.skippedOutsideWorkingHours} candidate(s) were skipped because they fell outside effective working hours.`
            : ""}
        </p>
        <p>Use the existing staging magic-link flow with any of these demo users:</p>
        <ul>
          {result.loginEmails.map((email) => <li key={email}><code>{email}</code></li>)}
        </ul>
      </div>}
    </div>
  </div>;
}
