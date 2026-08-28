"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type WorkforceItem = {
  userId: string;
  userName: string;
  email: string;
  status: "WORKING" | "WORKING_OFFLINE" | "ONLINE" | "OFFLINE";
  online: boolean;
  lastLoginAt: string | null;
  activeSinceAt: string | null;
  lastSeenAt: string | null;
  propertyName: string | null;
  workAreaName: string | null;
  scheduleName: string | null;
  currentTaskName: string | null;
  currentTaskStartedAt: string | null;
  workAreaStartedAt: string | null;
};

type FeedItem = {
  id: string;
  timestamp: string;
  taskName: string;
  sequence: number;
  actualSeconds: number | null;
  plannedSeconds: number;
  deviationSeconds: number | null;
  userName: string;
  propertyName: string;
  workAreaName: string;
  scheduleName: string;
};

type EvidenceItem = {
  id: string;
  type: "PHOTO" | "VIDEO";
  mimeType: string;
  capturedAt: string;
  signedUrl: string | null;
  taskName: string;
  scheduleName: string;
  propertyName: string;
  workAreaName: string;
  userName: string;
};

type AttentionItem = {
  id: string;
  status: string;
  scheduleName: string;
  propertyName: string;
  workAreaName: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  userName: string | null;
};

type DashboardData = {
  generatedAt: string;
  organizationName: string;
  timeZone: string;
  presenceAvailable: boolean;
  kpis: {
    usersOnline: number;
    usersTotal: number;
    schedulesInProgress: number;
    tasksCompletedToday: number;
    overdueOrMissed: number;
    averageDeviationSeconds: number | null;
  };
  workforce: WorkforceItem[];
  feed: FeedItem[];
  evidence: EvidenceItem[];
  attention: AttentionItem[];
  progress: {
    completed: number;
    inProgress: number;
    upcoming: number;
    overdue: number;
    missed: number;
    partial: number;
  };
};

const POLL_MS = 12_000;

function formatTime(value: string | null, timeZone: string, withSeconds = true) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  }).format(new Date(value));
}

function formatDateTime(value: string | null, timeZone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function durationLabel(seconds: number | null) {
  if (seconds == null) return "—";
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function liveDuration(startAt: string | null, nowMs: number) {
  if (!startAt) return "—";
  return durationLabel(Math.floor((nowMs - new Date(startAt).getTime()) / 1000));
}

function deviationLabel(seconds: number | null) {
  if (seconds == null) return "—";
  if (seconds === 0) return "On plan";
  return `${seconds > 0 ? "+" : "−"}${durationLabel(Math.abs(seconds))}`;
}

function statusLabel(status: WorkforceItem["status"]) {
  if (status === "WORKING") return "Working";
  if (status === "WORKING_OFFLINE") return "Working · no heartbeat";
  if (status === "ONLINE") return "Online / Idle";
  return "Offline";
}

function statusClass(status: WorkforceItem["status"]) {
  if (status === "WORKING") return "working";
  if (status === "WORKING_OFFLINE") return "warning";
  if (status === "ONLINE") return "online";
  return "offline";
}

export function LiveOperationsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");
  const [nowMs, setNowMs] = useState(Date.now());
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);
  const evidenceRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/dashboard/live", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Unable to load dashboard.");
        if (!cancelled) {
          setData(payload);
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load dashboard.");
      }
    };

    void load();
    const poll = setInterval(() => void load(), POLL_MS);
    const clock = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, []);

  const progressTotal = useMemo(() => {
    if (!data) return 0;
    return Object.values(data.progress).reduce((sum, value) => sum + value, 0);
  }, [data]);

  if (!data) {
    return (
      <div className="dashboardLoading card">
        <div className="liveDot" />
        <div>
          <strong>Loading live operations…</strong>
          <p className="muted">Connecting to current Schedule and execution data.</p>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  const scrollEvidence = (direction: number) => {
    evidenceRef.current?.scrollBy({ left: direction * 420, behavior: "smooth" });
  };

  return (
    <div className="dashboardStack">
      <div className="dashboardToolbar">
        <div className="liveStatus"><span className="liveDot" /> Live · refreshes every 12 sec</div>
        <span className="muted">Updated {formatTime(data.generatedAt, data.timeZone)}</span>
      </div>

      {!data.presenceAvailable && (
        <div className="notice warning">
          Live presence is waiting for the v0.7.0 presence migration. Execution, feed and evidence data remain available.
        </div>
      )}
      {error && <div className="notice warning">Latest refresh failed: {error}. Showing the most recent successful data.</div>}

      <section className="kpiGrid">
        <article className="kpiCard">
          <span className="kpiLabel">Users Online</span>
          <strong>{data.kpis.usersOnline}<small> / {data.kpis.usersTotal}</small></strong>
          <span className="kpiHint">Active USER-role workers</span>
        </article>
        <article className="kpiCard">
          <span className="kpiLabel">Schedules In Progress</span>
          <strong>{data.kpis.schedulesInProgress}</strong>
          <span className="kpiHint">Currently being executed</span>
        </article>
        <article className="kpiCard">
          <span className="kpiLabel">Tasks Completed Today</span>
          <strong>{data.kpis.tasksCompletedToday}</strong>
          <span className="kpiHint">Completed occurrence tasks</span>
        </article>
        <article className="kpiCard attentionKpi">
          <span className="kpiLabel">Needs Attention</span>
          <strong>{data.kpis.overdueOrMissed}</strong>
          <span className="kpiHint">Overdue, missed or partial</span>
        </article>
        <article className="kpiCard">
          <span className="kpiLabel">Avg. Deviation Today</span>
          <strong className={data.kpis.averageDeviationSeconds && data.kpis.averageDeviationSeconds > 0 ? "lateMetric" : ""}>
            {deviationLabel(data.kpis.averageDeviationSeconds)}
          </strong>
          <span className="kpiHint">Actual vs planned task time</span>
        </article>
      </section>

      <section className="dashboardTwoCol dashboardTopGrid">
        <article className="dashboardPanel">
          <div className="panelHeader">
            <div><span className="eyebrow">Live workforce</span><h2>Who is active now</h2></div>
            <span className="panelCount">{data.workforce.length} users</span>
          </div>
          <div className="workforceTableWrap">
            <table className="table workforceTable">
              <thead>
                <tr>
                  <th>User</th><th>Status</th><th>Last Login</th><th>Active For</th><th>Property</th><th>Work Area</th><th>Current Task</th><th>In Area For</th>
                </tr>
              </thead>
              <tbody>
                {data.workforce.map((item) => (
                  <tr key={item.userId}>
                    <td><strong>{item.userName}</strong><small className="tableSubtext">{item.email}</small></td>
                    <td><span className={`presenceBadge ${statusClass(item.status)}`}><i />{statusLabel(item.status)}</span></td>
                    <td>{formatDateTime(item.lastLoginAt, data.timeZone)}</td>
                    <td>{item.online ? liveDuration(item.activeSinceAt, nowMs) : "—"}</td>
                    <td>{item.propertyName ?? "—"}</td>
                    <td>{item.workAreaName ?? "—"}</td>
                    <td>{item.currentTaskName ?? "—"}</td>
                    <td>{liveDuration(item.workAreaStartedAt, nowMs)}</td>
                  </tr>
                ))}
                {!data.workforce.length && <tr><td colSpan={8} className="muted">No active USER-role members.</td></tr>}
              </tbody>
            </table>
          </div>
        </article>

        <article className="dashboardPanel attentionPanel">
          <div className="panelHeader">
            <div><span className="eyebrow">Action queue</span><h2>Attention required</h2></div>
            <span className="panelCount">{data.attention.length}</span>
          </div>
          <div className="attentionList">
            {data.attention.map((item) => (
              <div className="attentionItem" key={item.id}>
                <div className={`attentionIcon ${item.status.toLowerCase()}`}>!</div>
                <div>
                  <strong>{item.scheduleName}</strong>
                  <span>{item.propertyName} · {item.workAreaName}</span>
                  <small>{item.status.replaceAll("_", " ")} · scheduled {formatDateTime(item.scheduledStartAt, data.timeZone)}{item.userName ? ` · ${item.userName}` : ""}</small>
                </div>
              </div>
            ))}
            {!data.attention.length && <div className="emptyState"><span>✓</span><strong>No immediate exceptions</strong><p className="muted">Overdue, missed and partially completed schedules will appear here.</p></div>}
          </div>
        </article>
      </section>

      <section className="dashboardTwoCol">
        <article className="dashboardPanel feedPanel">
          <div className="panelHeader">
            <div><span className="eyebrow">Activity feed</span><h2>Task completions</h2></div>
            <span className="liveStatus"><span className="liveDot" /> Updating</span>
          </div>
          <div className="activityFeed">
            {data.feed.map((item) => (
              <div className="feedItem" key={item.id}>
                <time>{formatTime(item.timestamp, data.timeZone)}</time>
                <div className="feedMarker" />
                <div className="feedCopy">
                  <p><strong>{item.userName}</strong> completed <strong>{item.taskName}</strong> in <strong>{item.workAreaName}</strong>.</p>
                  <span>{item.propertyName} · {item.scheduleName}</span>
                  <small>Actual {durationLabel(item.actualSeconds)} · Planned {durationLabel(item.plannedSeconds)} · <b className={item.deviationSeconds && item.deviationSeconds > 0 ? "lateMetric" : "goodMetric"}>{deviationLabel(item.deviationSeconds)}</b></small>
                </div>
              </div>
            ))}
            {!data.feed.length && <div className="emptyState"><strong>No completed tasks yet</strong><p className="muted">Completions will stream here as users finish work.</p></div>}
          </div>
        </article>

        <article className="dashboardPanel progressPanel">
          <div className="panelHeader"><div><span className="eyebrow">Today's plan</span><h2>Schedule progress</h2></div><span className="panelCount">{progressTotal} total</span></div>
          <div className="progressSummary">
            {[
              ["Completed", data.progress.completed, "completed"],
              ["In Progress", data.progress.inProgress, "inprogress"],
              ["Upcoming", data.progress.upcoming, "upcoming"],
              ["Overdue", data.progress.overdue, "overdue"],
              ["Missed", data.progress.missed, "missed"],
              ["Partial", data.progress.partial, "partial"],
            ].map(([label, value, className]) => {
              const numberValue = Number(value);
              const pct = progressTotal ? Math.round(numberValue / progressTotal * 100) : 0;
              return (
                <div className="progressRow" key={String(label)}>
                  <div><span>{label}</span><strong>{numberValue}</strong></div>
                  <div className="progressTrack"><i className={String(className)} style={{ width: `${pct}%` }} /></div>
                  <small>{pct}%</small>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      <section className="dashboardPanel evidencePanel">
        <div className="panelHeader">
          <div><span className="eyebrow">Recent evidence</span><h2>Latest 20 photos & videos</h2></div>
          <div className="carouselButtons"><button type="button" onClick={() => scrollEvidence(-1)} aria-label="Previous evidence">←</button><button type="button" onClick={() => scrollEvidence(1)} aria-label="Next evidence">→</button></div>
        </div>
        <div className="evidenceCarousel" ref={evidenceRef}>
          {data.evidence.map((item) => (
            <button className="evidenceCard" type="button" key={item.id} onClick={() => setSelectedEvidence(item)} disabled={!item.signedUrl}>
              <div className="evidenceMedia">
                {item.signedUrl && item.type === "PHOTO" ? <img src={item.signedUrl} alt={`${item.taskName} evidence`} /> : null}
                {item.signedUrl && item.type === "VIDEO" ? <video src={item.signedUrl} muted preload="metadata" /> : null}
                {!item.signedUrl ? <div className="evidenceUnavailable">Media unavailable</div> : null}
                {item.type === "VIDEO" && <span className="videoBadge">▶ Video</span>}
              </div>
              <div className="evidenceMeta">
                <strong>{item.workAreaName}</strong>
                <span>{item.taskName}</span>
                <small>{item.userName} · {formatTime(item.capturedAt, data.timeZone)}</small>
              </div>
            </button>
          ))}
          {!data.evidence.length && <div className="emptyState wide"><strong>No evidence uploaded yet</strong><p className="muted">The latest 20 mobile photos and videos will appear here.</p></div>}
        </div>
      </section>

      {selectedEvidence && (
        <div className="dashboardMediaModal" role="dialog" aria-modal="true" onClick={() => setSelectedEvidence(null)}>
          <div className="dashboardMediaDialog" onClick={(event) => event.stopPropagation()}>
            <button className="modalClose" type="button" onClick={() => setSelectedEvidence(null)} aria-label="Close">×</button>
            <div className="modalMedia">
              {selectedEvidence.type === "PHOTO" && selectedEvidence.signedUrl ? <img src={selectedEvidence.signedUrl} alt="Evidence" /> : null}
              {selectedEvidence.type === "VIDEO" && selectedEvidence.signedUrl ? <video src={selectedEvidence.signedUrl} controls autoPlay /> : null}
            </div>
            <div className="modalEvidenceMeta">
              <h3>{selectedEvidence.taskName}</h3>
              <p>{selectedEvidence.propertyName} · {selectedEvidence.workAreaName}</p>
              <span>{selectedEvidence.scheduleName} · {selectedEvidence.userName} · {formatDateTime(selectedEvidence.capturedAt, data.timeZone)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
