"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { DemoRole } from "@/lib/demoWorkspace";

type DemoEvent = {
  id: string;
  dateKey: string;
  scheduleId: string;
  scheduleName: string;
  propertyId: string;
  propertyName: string;
  workAreaId: string;
  workAreaName: string;
  status: string;
  plannedMinutes: number;
  actualMinutes: number | null;
  delayMinutes: number;
  assignee: string;
  exception: string | null;
};

type DashboardSnapshot = {
  dateKey: string;
  events: DemoEvent[];
  counts: {
    total: number;
    completed: number;
    onTime: number;
    late: number;
    inProgress: number;
    upcoming: number;
    missed: number;
    incomplete: number;
  };
  exceptions: DemoEvent[];
};

type WorkforceItem = {
  userId: string;
  userName: string;
  email: string;
  status: "WORKING" | "WORKING_OFFLINE" | "ONLINE" | "OFFLINE";
  online: boolean;
  lastLoginAt: string | null;
  activeSinceAt: string | null;
  propertyName: string | null;
  workAreaName: string | null;
  currentTaskName: string | null;
  workAreaStartedAt: string | null;
  propertyId: string;
};

type EvidenceItem = {
  id: string;
  type: "PHOTO";
  capturedAt: string;
  signedUrl: string;
  taskName: string;
  scheduleName: string;
  propertyName: string;
  workAreaName: string;
  userName: string;
  propertyId: string;
};

type FeedItem = {
  id: string;
  timestamp: string;
  taskName: string;
  actualSeconds: number;
  plannedSeconds: number;
  deviationSeconds: number;
  userName: string;
  propertyName: string;
  workAreaName: string;
  scheduleName: string;
  scheduleId: string;
  propertyId: string;
};

function isoBefore(anchorMs: number, minutes: number) {
  return new Date(anchorMs - minutes * 60_000).toISOString();
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

function deviationLabel(seconds: number | null) {
  if (seconds == null) return "—";
  if (seconds === 0) return "On plan";
  return `${seconds > 0 ? "+" : "−"}${durationLabel(Math.abs(seconds))}`;
}

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

function liveDuration(startAt: string | null, nowMs: number) {
  if (!startAt) return "—";
  return durationLabel(Math.floor((nowMs - new Date(startAt).getTime()) / 1000));
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

function propertyVisible(role: DemoRole, propertyId: string) {
  return role === "ADMIN" || propertyId === "freshbite-foods";
}

function buildWorkforce(anchorMs: number): WorkforceItem[] {
  return [
    {
      userId: "emma-qa",
      userName: "Emma Davis",
      email: "emma.davis@example.demo",
      status: "WORKING",
      online: true,
      lastLoginAt: isoBefore(anchorMs, 42),
      activeSinceAt: isoBefore(anchorMs, 42),
      propertyName: "FreshBite Foods Manufacturing Plant",
      workAreaName: "Line 1 — Prepared Meals",
      currentTaskName: "Cooking & Critical Temperature Check",
      workAreaStartedAt: isoBefore(anchorMs, 26),
      propertyId: "freshbite-foods",
    },
    {
      userId: "marcus-pack",
      userName: "Marcus Lee",
      email: "marcus.lee@example.demo",
      status: "ONLINE",
      online: true,
      lastLoginAt: isoBefore(anchorMs, 64),
      activeSinceAt: isoBefore(anchorMs, 64),
      propertyName: "FreshBite Foods Manufacturing Plant",
      workAreaName: null,
      currentTaskName: null,
      workAreaStartedAt: null,
      propertyId: "freshbite-foods",
    },
    {
      userId: "priya-qc",
      userName: "Priya Shah",
      email: "priya.shah@example.demo",
      status: "OFFLINE",
      online: false,
      lastLoginAt: isoBefore(anchorMs, 1280),
      activeSinceAt: null,
      propertyName: "FreshBite Foods Manufacturing Plant",
      workAreaName: null,
      currentTaskName: null,
      workAreaStartedAt: null,
      propertyId: "freshbite-foods",
    },
    {
      userId: "olivia-hk",
      userName: "Olivia Brown",
      email: "olivia.brown@example.demo",
      status: "WORKING",
      online: true,
      lastLoginAt: isoBefore(anchorMs, 31),
      activeSinceAt: isoBefore(anchorMs, 31),
      propertyName: "Grand Vista Hotel",
      workAreaName: "Guest Rooms — Floor 4",
      currentTaskName: "Guest Room Readiness Inspection",
      workAreaStartedAt: isoBefore(anchorMs, 18),
      propertyId: "grand-vista-hotel",
    },
    {
      userId: "daniel-hotel",
      userName: "Daniel Kim",
      email: "daniel.kim@example.demo",
      status: "OFFLINE",
      online: false,
      lastLoginAt: isoBefore(anchorMs, 1490),
      activeSinceAt: null,
      propertyName: "Grand Vista Hotel",
      workAreaName: null,
      currentTaskName: null,
      workAreaStartedAt: null,
      propertyId: "grand-vista-hotel",
    },
    {
      userId: "noah-tech",
      userName: "Noah Williams",
      email: "noah.williams@example.demo",
      status: "WORKING_OFFLINE",
      online: false,
      lastLoginAt: isoBefore(anchorMs, 95),
      activeSinceAt: null,
      propertyName: "Industrial Maintenance Facility",
      workAreaName: "Packaging Machine Cell",
      currentTaskName: "Breakdown Maintenance — Repair Closeout",
      workAreaStartedAt: isoBefore(anchorMs, 47),
      propertyId: "industrial-maintenance",
    },
    {
      userId: "miguel-maint",
      userName: "Miguel Torres",
      email: "miguel.torres@example.demo",
      status: "ONLINE",
      online: true,
      lastLoginAt: isoBefore(anchorMs, 54),
      activeSinceAt: isoBefore(anchorMs, 54),
      propertyName: "Industrial Maintenance Facility",
      workAreaName: null,
      currentTaskName: null,
      workAreaStartedAt: null,
      propertyId: "industrial-maintenance",
    },
    {
      userId: "chloe-office",
      userName: "Chloe Martin",
      email: "chloe.martin@example.demo",
      status: "OFFLINE",
      online: false,
      lastLoginAt: isoBefore(anchorMs, 1110),
      activeSinceAt: null,
      propertyName: "Corporate Headquarters",
      workAreaName: null,
      currentTaskName: null,
      workAreaStartedAt: null,
      propertyId: "corporate-hq",
    },
  ];
}

function buildEvidence(anchorMs: number): EvidenceItem[] {
  return [
    {
      id: "evidence-food-line",
      type: "PHOTO",
      capturedAt: isoBefore(anchorMs, 8),
      signedUrl: "/demo/evidence/food-line.svg",
      taskName: "Butter Chicken Bowl — Cooking & Critical Temperature Check",
      scheduleName: "Butter Chicken Bowl — Lot Production",
      propertyName: "FreshBite Foods Manufacturing Plant",
      workAreaName: "Line 1 — Prepared Meals",
      userName: "Emma Davis",
      propertyId: "freshbite-foods",
    },
    {
      id: "evidence-hotel-room",
      type: "PHOTO",
      capturedAt: isoBefore(anchorMs, 19),
      signedUrl: "/demo/evidence/hotel-room.svg",
      taskName: "Guest Room Readiness Inspection",
      scheduleName: "Daily Guest Room Readiness — Floor 4",
      propertyName: "Grand Vista Hotel",
      workAreaName: "Guest Rooms — Floor 4",
      userName: "Olivia Brown",
      propertyId: "grand-vista-hotel",
    },
    {
      id: "evidence-maintenance",
      type: "PHOTO",
      capturedAt: isoBefore(anchorMs, 36),
      signedUrl: "/demo/evidence/maintenance.svg",
      taskName: "Breakdown Maintenance — Safe Triage",
      scheduleName: "Packaging Machine Breakdown Response",
      propertyName: "Industrial Maintenance Facility",
      workAreaName: "Packaging Machine Cell",
      userName: "Noah Williams",
      propertyId: "industrial-maintenance",
    },
    {
      id: "evidence-office",
      type: "PHOTO",
      capturedAt: isoBefore(anchorMs, 72),
      signedUrl: "/demo/evidence/office.svg",
      taskName: "Meeting Room Readiness",
      scheduleName: "Meeting Room Morning Readiness",
      propertyName: "Corporate Headquarters",
      workAreaName: "Meeting Rooms",
      userName: "Chloe Martin",
      propertyId: "corporate-hq",
    },
  ];
}

function buildFeed(anchorMs: number): FeedItem[] {
  return [
    {
      id: "feed-1",
      timestamp: isoBefore(anchorMs, 6),
      taskName: "Metal Detection & Label Verification",
      actualSeconds: 1180,
      plannedSeconds: 1200,
      deviationSeconds: -20,
      userName: "Emma Davis",
      propertyName: "FreshBite Foods Manufacturing Plant",
      workAreaName: "Line 1 — Prepared Meals",
      scheduleName: "Butter Chicken Bowl — Lot Production",
      scheduleId: "lot-butter-chicken",
      propertyId: "freshbite-foods",
    },
    {
      id: "feed-2",
      timestamp: isoBefore(anchorMs, 17),
      taskName: "Guest Room Readiness Inspection",
      actualSeconds: 1960,
      plannedSeconds: 1800,
      deviationSeconds: 160,
      userName: "Olivia Brown",
      propertyName: "Grand Vista Hotel",
      workAreaName: "Guest Rooms — Floor 4",
      scheduleName: "Daily Guest Room Readiness — Floor 4",
      scheduleId: "hotel-room-turn",
      propertyId: "grand-vista-hotel",
    },
    {
      id: "feed-3",
      timestamp: isoBefore(anchorMs, 33),
      taskName: "Breakdown Maintenance — Safe Triage",
      actualSeconds: 1680,
      plannedSeconds: 1800,
      deviationSeconds: -120,
      userName: "Noah Williams",
      propertyName: "Industrial Maintenance Facility",
      workAreaName: "Packaging Machine Cell",
      scheduleName: "Packaging Machine Breakdown Response",
      scheduleId: "packaging-breakdown",
      propertyId: "industrial-maintenance",
    },
    {
      id: "feed-4",
      timestamp: isoBefore(anchorMs, 58),
      taskName: "Meeting Room Readiness",
      actualSeconds: 1540,
      plannedSeconds: 1800,
      deviationSeconds: -260,
      userName: "Chloe Martin",
      propertyName: "Corporate Headquarters",
      workAreaName: "Meeting Rooms",
      scheduleName: "Meeting Room Morning Readiness",
      scheduleId: "hq-meeting-readiness",
      propertyId: "corporate-hq",
    },
  ];
}

export function DemoLiveOperationsDashboard({
  role,
  snapshot,
  anchorIso,
}: {
  role: DemoRole;
  snapshot: DashboardSnapshot;
  anchorIso: string;
}) {
  const anchorMs = new Date(anchorIso).getTime();
  const [nowMs, setNowMs] = useState(anchorMs);
  const [evidenceIndex, setEvidenceIndex] = useState(0);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);

  useEffect(() => {
    const clock = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(clock);
  }, []);

  const workforce = useMemo(
    () => buildWorkforce(anchorMs).filter((item) => propertyVisible(role, item.propertyId)),
    [anchorMs, role]
  );

  const evidence = useMemo(
    () => buildEvidence(anchorMs).filter((item) => propertyVisible(role, item.propertyId)),
    [anchorMs, role]
  );

  const feed = useMemo(
    () => buildFeed(anchorMs).filter((item) => propertyVisible(role, item.propertyId)),
    [anchorMs, role]
  );

  useEffect(() => {
    if (evidence.length < 2) return;
    const timer = window.setInterval(
      () => setEvidenceIndex((current) => (current + 1) % evidence.length),
      30_000
    );
    return () => window.clearInterval(timer);
  }, [evidence.length]);

  const usersOnline = workforce.filter((item) => item.online).length;
  const schedulesInProgress = snapshot.counts.inProgress;
  const tasksCompletedToday = Math.max(snapshot.counts.completed, feed.length);
  const overdueOrMissed = snapshot.counts.missed + snapshot.counts.incomplete;
  const averageDeviationSeconds = feed.length
    ? Math.round(feed.reduce((sum, item) => sum + item.deviationSeconds, 0) / feed.length)
    : 0;

  const progress = {
    completed: snapshot.counts.completed,
    inProgress: snapshot.counts.inProgress,
    upcoming: snapshot.counts.upcoming,
    overdue: snapshot.counts.late,
    missed: snapshot.counts.missed,
    partial: snapshot.counts.incomplete,
  };

  const progressTotal = Object.values(progress).reduce((sum, value) => sum + value, 0);

  return (
    <div className="dashboardStack">
      <div className="dashboardToolbar">
        <div className="liveStatus">
          <span className="liveDot" /> Demo live simulation · sample data
        </div>
        <span className="muted">Updated {formatTime(anchorIso, "America/Denver")}</span>
      </div>

      <section className="dashboardOverviewGrid">
        <article className="dashboardPanel operationalSummary">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">Operations snapshot</span>
              <h2>Today at a glance</h2>
            </div>
          </div>
          <div className="summaryMetricGrid">
            <div>
              <span>Schedules In Progress</span>
              <strong>{schedulesInProgress}</strong>
            </div>
            <div>
              <span>Tasks Completed Today</span>
              <strong>{tasksCompletedToday}</strong>
            </div>
            <div className="attentionMetric">
              <span>Needs Attention</span>
              <strong>{overdueOrMissed}</strong>
            </div>
            <div>
              <span>Avg. Deviation Today</span>
              <strong className={averageDeviationSeconds > 0 ? "lateMetric" : ""}>
                {deviationLabel(averageDeviationSeconds)}
              </strong>
            </div>
          </div>
        </article>

        <article className={`dashboardPanel evidenceFeaturePanel${evidenceExpanded ? " expanded" : ""}`}>
          <div className="panelHeader">
            <div>
              <span className="eyebrow">Recent evidence</span>
              <h2>Latest photos & videos</h2>
            </div>
            <div className="evidenceFeatureControls">
              <span className="panelCount">
                {evidence.length ? `${(evidenceIndex % evidence.length) + 1} / ${evidence.length}` : "0"}
              </span>
              <button
                type="button"
                onClick={() => setEvidenceExpanded((value) => !value)}
                aria-label={evidenceExpanded ? "Minimize evidence" : "Maximize evidence"}
              >
                {evidenceExpanded ? "↙" : "↗"}
              </button>
            </div>
          </div>

          {evidence.length ? (() => {
            const item = evidence[evidenceIndex % evidence.length];
            return (
              <div className="featuredEvidence">
                <button
                  className="featuredEvidenceMedia"
                  type="button"
                  onClick={() => setSelectedEvidence(item)}
                >
                  <img src={item.signedUrl} alt={`Demo evidence: ${item.taskName}`} />
                </button>
                <div className="featuredEvidenceDetails">
                  <strong>{item.workAreaName}</strong>
                  <span>{item.taskName}</span>
                  <small>{item.propertyName} · {item.scheduleName}</small>
                  <small>{item.userName} · {formatDateTime(item.capturedAt, "America/Denver")}</small>
                  <div className="evidenceNav">
                    <button
                      type="button"
                      onClick={() =>
                        setEvidenceIndex((current) => (current - 1 + evidence.length) % evidence.length)
                      }
                    >
                      ← Previous
                    </button>
                    <button
                      type="button"
                      onClick={() => setEvidenceIndex((current) => (current + 1) % evidence.length)}
                    >
                      Next →
                    </button>
                  </div>
                </div>
                {evidenceExpanded ? (
                  <div className="evidenceExpandedStrip">
                    {evidence.map((thumb, index) => (
                      <button
                        key={thumb.id}
                        className={index === evidenceIndex % evidence.length ? "active" : ""}
                        type="button"
                        onClick={() => setEvidenceIndex(index)}
                      >
                        <img src={thumb.signedUrl} alt="" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })() : (
            <div className="emptyState">
              <strong>No recent evidence</strong>
              <p className="muted">Sample photos and videos will appear here.</p>
            </div>
          )}
        </article>
      </section>

      <section className="dashboardTwoCol dashboardTopGrid">
        <article className="dashboardPanel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">Live workforce</span>
              <h2>Who is active now</h2>
            </div>
            <span className="panelCount">
              <strong>{usersOnline}</strong> online <small>/ {workforce.length} users</small>
            </span>
          </div>

          <div className="workforceTableWrap">
            <table className="table workforceTable">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Active For</th>
                  <th>Property</th>
                  <th>Work Area</th>
                  <th>Current Task</th>
                  <th>In Area For</th>
                </tr>
              </thead>
              <tbody>
                {workforce.map((item) => (
                  <tr key={item.userId}>
                    <td>
                      <strong>{item.userName}</strong>
                      <small className="tableSubtext">{item.email}</small>
                    </td>
                    <td>
                      <span className={`presenceBadge ${statusClass(item.status)}`}>
                        <i />
                        {statusLabel(item.status)}
                      </span>
                    </td>
                    <td>{formatDateTime(item.lastLoginAt, "America/Denver")}</td>
                    <td>{item.online ? liveDuration(item.activeSinceAt, nowMs) : "—"}</td>
                    <td>{item.propertyName ?? "—"}</td>
                    <td>{item.workAreaName ?? "—"}</td>
                    <td>{item.currentTaskName ?? "—"}</td>
                    <td>{liveDuration(item.workAreaStartedAt, nowMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="dashboardPanel attentionPanel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">Action queue</span>
              <h2>Attention required</h2>
            </div>
            <span className="panelCount">{snapshot.exceptions.length}</span>
          </div>
          <div className="attentionList">
            {snapshot.exceptions.slice(0, 6).map((item) => (
              <div className="attentionItem" key={item.id}>
                <div className={`attentionIcon ${item.status.toLowerCase()}`}>!</div>
                <div>
                  <strong>{item.scheduleName}</strong>
                  <span>{item.propertyName} · {item.workAreaName}</span>
                  <small>{item.status.replaceAll("_", " ")} · {item.assignee}</small>
                  {item.exception ? <p>{item.exception}</p> : null}
                  <Link className="demoInlineLink" href={`/demo/schedules/${item.scheduleId}`}>
                    Review Schedule
                  </Link>
                </div>
              </div>
            ))}
            {!snapshot.exceptions.length ? (
              <div className="emptyState">
                <span>✓</span>
                <strong>No immediate exceptions</strong>
                <p className="muted">Synthetic overdue, missed and partial work will appear here.</p>
              </div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="dashboardTwoCol">
        <article className="dashboardPanel feedPanel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">Activity feed</span>
              <h2>Task completions</h2>
            </div>
            <span className="liveStatus"><span className="liveDot" /> Updating</span>
          </div>
          <div className="activityFeed">
            {feed.map((item) => (
              <div className="feedItem" key={item.id}>
                <time>{formatTime(item.timestamp, "America/Denver")}</time>
                <div className="feedMarker" />
                <div className="feedCopy">
                  <p>
                    <strong>{item.userName}</strong> completed <strong>{item.taskName}</strong> in{" "}
                    <strong>{item.workAreaName}</strong>.
                  </p>
                  <span>{item.propertyName} · {item.scheduleName}</span>
                  <small>
                    Actual {durationLabel(item.actualSeconds)} · Planned {durationLabel(item.plannedSeconds)} ·{" "}
                    <b className={item.deviationSeconds > 0 ? "lateMetric" : "goodMetric"}>
                      {deviationLabel(item.deviationSeconds)}
                    </b>
                  </small>
                  <Link className="demoInlineLink" href={`/demo/schedules/${item.scheduleId}`}>
                    Open Schedule
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="dashboardPanel progressPanel">
          <div className="panelHeader">
            <div>
              <span className="eyebrow">Today&apos;s plan</span>
              <h2>Schedule progress</h2>
            </div>
            <span className="panelCount">{progressTotal} total</span>
          </div>
          <div className="progressSummary">
            {[
              ["Completed", progress.completed, "completed"],
              ["In Progress", progress.inProgress, "inprogress"],
              ["Upcoming", progress.upcoming, "upcoming"],
              ["Overdue", progress.overdue, "overdue"],
              ["Missed", progress.missed, "missed"],
              ["Partial", progress.partial, "partial"],
            ].map(([label, value, className]) => {
              const numberValue = Number(value);
              const pct = progressTotal ? Math.round((numberValue / progressTotal) * 100) : 0;
              return (
                <div className="progressRow" key={String(label)}>
                  <div>
                    <span>{label}</span>
                    <strong>{numberValue}</strong>
                  </div>
                  <div className="progressTrack">
                    <i className={String(className)} style={{ width: `${pct}%` }} />
                  </div>
                  <small>{pct}%</small>
                </div>
              );
            })}
          </div>
        </article>
      </section>

      {selectedEvidence ? (
        <div
          className="dashboardMediaModal"
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedEvidence(null)}
        >
          <div className="dashboardMediaDialog" onClick={(event) => event.stopPropagation()}>
            <button
              className="modalClose"
              type="button"
              onClick={() => setSelectedEvidence(null)}
              aria-label="Close"
            >
              ×
            </button>
            <div className="modalMedia">
              <img src={selectedEvidence.signedUrl} alt="Demo evidence" />
            </div>
            <div className="modalEvidenceMeta">
              <h3>{selectedEvidence.taskName}</h3>
              <p>{selectedEvidence.propertyName} · {selectedEvidence.workAreaName}</p>
              <span>
                {selectedEvidence.scheduleName} · {selectedEvidence.userName} ·{" "}
                {formatDateTime(selectedEvidence.capturedAt, "America/Denver")}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
