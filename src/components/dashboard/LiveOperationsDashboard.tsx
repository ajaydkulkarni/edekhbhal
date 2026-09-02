"use client";

import { useEffect, useMemo, useState } from "react";

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
  kind: "SCHEDULE" | "REPORTED_WORK";
  id: string;
  status: string;
  scheduleName: string;
  propertyName: string;
  workAreaName: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  userName: string | null;
  propertyId: string | null;
  workAreaId: string;
  note: string | null;
  reportedAt: string | null;
  reportedBy: string | null;
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
  const [evidenceIndex, setEvidenceIndex] = useState(0);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);

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
    const resume = () => void load();
    const visibility = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(clock);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  useEffect(() => {
    const count = data?.evidence.length ?? 0;
    if (count < 2) return;
    const timer = setInterval(() => setEvidenceIndex((current) => (current + 1) % count), 30_000);
    return () => clearInterval(timer);
  }, [data?.evidence.length]);

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

      <section className="dashboardOverviewGrid">
        <article className="dashboardPanel operationalSummary">
          <div className="panelHeader"><div><span className="eyebrow">Operations snapshot</span><h2>Today at a glance</h2></div></div>
          <div className="summaryMetricGrid">
            <div><span>Schedules In Progress</span><strong>{data.kpis.schedulesInProgress}</strong></div>
            <div><span>Tasks Completed Today</span><strong>{data.kpis.tasksCompletedToday}</strong></div>
            <div className="attentionMetric"><span>Needs Attention</span><strong>{data.kpis.overdueOrMissed}</strong></div>
            <div><span>Avg. Deviation Today</span><strong className={data.kpis.averageDeviationSeconds && data.kpis.averageDeviationSeconds > 0 ? "lateMetric" : ""}>{deviationLabel(data.kpis.averageDeviationSeconds)}</strong></div>
          </div>
        </article>
        <article className={`dashboardPanel evidenceFeaturePanel${evidenceExpanded ? " expanded" : ""}`}>
          <div className="panelHeader">
            <div><span className="eyebrow">Recent evidence</span><h2>Latest photos & videos</h2></div>
            <div className="evidenceFeatureControls"><span className="panelCount">{data.evidence.length ? `${(evidenceIndex % data.evidence.length) + 1} / ${data.evidence.length}` : "0"}</span><button type="button" onClick={() => setEvidenceExpanded(v => !v)} aria-label={evidenceExpanded ? "Minimize evidence" : "Maximize evidence"}>{evidenceExpanded ? "↙" : "↗"}</button></div>
          </div>
          {data.evidence.length ? (() => {
            const item=data.evidence[evidenceIndex % data.evidence.length];
            return <div className="featuredEvidence">
              <button className="featuredEvidenceMedia" type="button" onClick={() => setSelectedEvidence(item)} disabled={!item.signedUrl}>
                {item.signedUrl && item.type==="PHOTO" ? <img src={item.signedUrl} alt={`${item.taskName} evidence`}/> : null}
                {item.signedUrl && item.type==="VIDEO" ? <video src={item.signedUrl} muted playsInline preload="metadata"/> : null}
                {!item.signedUrl ? <span className="evidenceUnavailable">Media unavailable</span> : null}
                {item.type==="VIDEO" && <span className="videoBadge">▶ Video</span>}
              </button>
              <div className="featuredEvidenceDetails"><strong>{item.workAreaName}</strong><span>{item.taskName}</span><small>{item.propertyName} · {item.scheduleName}</small><small>{item.userName} · {formatDateTime(item.capturedAt,data.timeZone)}</small><div className="evidenceNav"><button type="button" onClick={() => setEvidenceIndex(current => (current - 1 + data.evidence.length) % data.evidence.length)}>← Previous</button><button type="button" onClick={() => setEvidenceIndex(current => (current + 1) % data.evidence.length)}>Next →</button></div></div>
              {evidenceExpanded && <div className="evidenceExpandedStrip">{data.evidence.map((thumb,index)=><button key={thumb.id} className={index===evidenceIndex % data.evidence.length?"active":""} type="button" onClick={() => setEvidenceIndex(index)}>{thumb.signedUrl && thumb.type==="PHOTO"?<img src={thumb.signedUrl} alt=""/>:<span>{thumb.type==="VIDEO"?"▶":"—"}</span>}</button>)}</div>}
            </div>;
          })() : <div className="emptyState"><strong>No recent evidence</strong><p className="muted">Captured photos and videos will rotate here every 30 seconds.</p></div>}
        </article>
      </section>

      <section className="dashboardTwoCol dashboardTopGrid">
        <article className="dashboardPanel">
          <div className="panelHeader">
            <div><span className="eyebrow">Live workforce</span><h2>Who is active now</h2></div>
            <span className="panelCount"><strong>{data.kpis.usersOnline}</strong> online <small>/ {data.kpis.usersTotal} users</small></span>
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
            {data.attention.map((item) => item.kind === "REPORTED_WORK" ? (
              <div className="attentionItem reportedWorkAttention" key={item.id}>
                <div className="attentionIcon reported">✎</div><div><strong>Reported Work · {item.workAreaName}</strong><span>{item.propertyName} · {item.reportedBy || "User"} · {formatDateTime(item.reportedAt, data.timeZone)}</span><p>{item.note}</p>
                <div className="row compact reportedWorkButtons"><a className="button small" href={`/schedules/new?workAreaId=${encodeURIComponent(item.workAreaId)}&reportedWorkItemId=${encodeURIComponent(item.id)}`}>Create Schedule</a><button type="button" className="button secondary small" onClick={async()=>{const response=await fetch(`/api/reported-work/${item.id}/dismiss`,{method:"POST"});if(response.ok)setData(current=>current?{...current,attention:current.attention.filter(row=>row.id!==item.id)}:current);}}>Dismiss</button></div></div>
              </div>
            ) : (
              <div className="attentionItem" key={item.id}><div className={`attentionIcon ${item.status.toLowerCase()}`}>!</div><div><strong>{item.scheduleName}</strong><span>{item.propertyName} · {item.workAreaName}</span><small>{item.status.replaceAll("_", " ")} · scheduled {formatDateTime(item.scheduledStartAt, data.timeZone)}{item.userName ? ` · ${item.userName}` : ""}</small></div></div>
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
