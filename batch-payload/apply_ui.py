from pathlib import Path
import re

def once(text,old,new,label):
    if old in text:return text.replace(old,new,1)
    if new in text:return text
    raise SystemExit(f"Patch stopped: {label} not found")

p=Path("src/components/dashboard/LiveOperationsDashboard.tsx");t=p.read_text()
t=t.replace("useEffect, useMemo, useRef, useState","useEffect, useMemo, useState")
old='''type AttentionItem = {
  id: string;
  status: string;
  scheduleName: string;
  propertyName: string;
  workAreaName: string;
  scheduledStartAt: string;
  scheduledEndAt: string;
  userName: string | null;
};'''
new='''type AttentionItem = {
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
};'''
t=once(t,old,new,"Dashboard AttentionItem")
t=once(t,'  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);\n  const evidenceRef = useRef<HTMLDivElement | null>(null);','  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceItem | null>(null);\n  const [evidenceIndex, setEvidenceIndex] = useState(0);\n  const [evidenceExpanded, setEvidenceExpanded] = useState(false);',"Dashboard evidence state")
rotation='''  useEffect(() => {
    const count = data?.evidence.length ?? 0;
    if (count < 2) return;
    const timer = setInterval(() => setEvidenceIndex((current) => (current + 1) % count), 30_000);
    return () => clearInterval(timer);
  }, [data?.evidence.length]);

'''
if "30_000" not in t:t=t.replace("  const progressTotal = useMemo(() => {",rotation+"  const progressTotal = useMemo(() => {",1)
t=re.sub(r'\n  const scrollEvidence = \(direction: number\) => \{\n    evidenceRef\.current\?\.scrollBy\(\{ left: direction \* 420, behavior: "smooth" \}\);\n  \};\n','\n',t,count=1)

start=t.find('      <section className="kpiGrid">'); end=t.find('      <section className="dashboardTwoCol dashboardTopGrid">')
if start<0 or end<0:raise SystemExit("Patch stopped: Dashboard KPI boundaries not found")
overview='''      <section className="dashboardOverviewGrid">
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

'''
t=t[:start]+overview+t[end:]
t=once(t,'<span className="panelCount">{data.workforce.length} users</span>','<span className="panelCount"><strong>{data.kpis.usersOnline}</strong> online <small>/ {data.kpis.usersTotal} users</small></span>',"Who active count")
old='''            {data.attention.map((item) => (
              <div className="attentionItem" key={item.id}>
                <div className={`attentionIcon ${item.status.toLowerCase()}`}>!</div>
                <div>
                  <strong>{item.scheduleName}</strong>
                  <span>{item.propertyName} · {item.workAreaName}</span>
                  <small>{item.status.replaceAll("_", " ")} · scheduled {formatDateTime(item.scheduledStartAt, data.timeZone)}{item.userName ? ` · ${item.userName}` : ""}</small>
                </div>
              </div>
            ))}'''
new='''            {data.attention.map((item) => item.kind === "REPORTED_WORK" ? (
              <div className="attentionItem reportedWorkAttention" key={item.id}>
                <div className="attentionIcon reported">✎</div><div><strong>Reported Work · {item.workAreaName}</strong><span>{item.propertyName} · {item.reportedBy || "User"} · {formatDateTime(item.reportedAt, data.timeZone)}</span><p>{item.note}</p>
                <div className="row compact reportedWorkButtons"><a className="button small" href={`/schedules/new?workAreaId=${encodeURIComponent(item.workAreaId)}&reportedWorkItemId=${encodeURIComponent(item.id)}`}>Create Schedule</a><button type="button" className="button secondary small" onClick={async()=>{const response=await fetch(`/api/reported-work/${item.id}/dismiss`,{method:"POST"});if(response.ok)setData(current=>current?{...current,attention:current.attention.filter(row=>row.id!==item.id)}:current);}}>Dismiss</button></div></div>
              </div>
            ) : (
              <div className="attentionItem" key={item.id}><div className={`attentionIcon ${item.status.toLowerCase()}`}>!</div><div><strong>{item.scheduleName}</strong><span>{item.propertyName} · {item.workAreaName}</span><small>{item.status.replaceAll("_", " ")} · scheduled {formatDateTime(item.scheduledStartAt, data.timeZone)}{item.userName ? ` · ${item.userName}` : ""}</small></div></div>
            ))}'''
t=once(t,old,new,"Attention renderer")
lower=t.find('      <section className="dashboardPanel evidencePanel">')
if lower>=0:
    modal=t.find('      {selectedEvidence && (',lower)
    if modal<0:raise SystemExit("Patch stopped: evidence modal boundary not found")
    t=t[:lower]+t[modal:]
p.write_text(t)

p=Path("src/app/modern.css");t=p.read_text();marker="/* Fine-tuning Batch 03 cumulative */"
block='''
/* Fine-tuning Batch 03 cumulative */
.dashboardOverviewGrid{display:grid;grid-template-columns:minmax(360px,.9fr) minmax(0,1.35fr);gap:18px}.summaryMetricGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.summaryMetricGrid>div{border:1px solid var(--line);background:#f8fafc;border-radius:12px;padding:13px;display:flex;flex-direction:column;gap:4px}.summaryMetricGrid span{font-size:10px;color:var(--muted);font-weight:750}.summaryMetricGrid strong{font-size:22px}.summaryMetricGrid .attentionMetric{background:#fff8f3;border-color:#f4d7c4}
.evidenceFeaturePanel{min-height:250px}.evidenceFeatureControls{display:flex;gap:7px;align-items:center}.evidenceFeatureControls>button{width:32px;height:32px;border:1px solid var(--line);background:#fff;border-radius:9px;cursor:pointer;font-size:18px}.featuredEvidence{display:grid;grid-template-columns:minmax(240px,1.25fr) minmax(190px,.75fr);gap:14px}.featuredEvidenceMedia{border:0;border-radius:12px;overflow:hidden;background:#e9eef5;min-height:178px;max-height:250px;padding:0;position:relative}.featuredEvidenceMedia img,.featuredEvidenceMedia video{width:100%;height:100%;min-height:178px;max-height:250px;object-fit:cover}.featuredEvidenceDetails{display:flex;flex-direction:column;justify-content:center;gap:5px}.featuredEvidenceDetails>small{font-size:10px;color:#7d899b}.evidenceNav{display:flex;gap:6px;margin-top:9px}.evidenceNav button{border:1px solid var(--line);background:#f8fafc;border-radius:8px;padding:6px 8px;font-size:10px;cursor:pointer}
.evidenceFeaturePanel.expanded{position:fixed;z-index:110;left:4vw;right:4vw;top:84px;max-height:calc(100vh - 110px);overflow:auto;box-shadow:0 30px 90px rgba(15,23,42,.35)}.evidenceFeaturePanel.expanded:before{content:"";position:fixed;inset:66px 0 0;background:rgba(15,23,42,.36);z-index:-1}.evidenceFeaturePanel.expanded .featuredEvidence{grid-template-columns:minmax(360px,.9fr) minmax(260px,.5fr);grid-template-rows:auto auto}.evidenceExpandedStrip{grid-column:1/-1;display:flex;gap:8px;overflow-x:auto;padding-top:8px}.evidenceExpandedStrip button{flex:0 0 96px;height:64px;border:2px solid transparent;border-radius:8px;padding:0;overflow:hidden;background:#e9eef5}.evidenceExpandedStrip button.active{border-color:var(--accent)}.evidenceExpandedStrip img{width:100%;height:100%;object-fit:cover}
.dashboardTopGrid{grid-template-columns:minmax(0,2.25fr) minmax(280px,.75fr)}.workforceTableWrap{overflow-x:visible}.workforceTable{table-layout:fixed;width:100%;min-width:0;font-size:11px}.workforceTable th,.workforceTable td{padding:8px 5px;line-height:1.22;overflow-wrap:anywhere}.workforceTable th:nth-child(1),.workforceTable td:nth-child(1){width:18%}.workforceTable th:nth-child(2),.workforceTable td:nth-child(2){width:15%}.workforceTable th:nth-child(3),.workforceTable td:nth-child(3){width:13%}.workforceTable th:nth-child(4),.workforceTable td:nth-child(4){width:9%}.workforceTable th:nth-child(5),.workforceTable td:nth-child(5){width:11%}.workforceTable th:nth-child(6),.workforceTable td:nth-child(6){width:11%}.workforceTable th:nth-child(7),.workforceTable td:nth-child(7){width:14%}.workforceTable th:nth-child(8),.workforceTable td:nth-child(8){width:9%}.workforceTable .presenceBadge{white-space:normal;padding:4px 6px;font-size:9px}.dashboardTopGrid .panelCount{display:flex;align-items:baseline;gap:4px}.dashboardTopGrid .panelCount strong{font-size:15px}.dashboardTopGrid .panelCount small{font-size:10px;font-weight:500}
.reportedWorkAttention{background:#f8fbff;border-color:#dbeafe}.attentionIcon.reported{background:#eff6ff;color:#2563eb}.reportedWorkAttention p{font-size:11px;line-height:1.4;margin:6px 0;white-space:pre-wrap}.reportedWorkButtons{margin-top:7px}
.propertyTeamColumns{display:grid;grid-template-columns:1fr 1fr;gap:22px}.propertyAssignedList{display:grid;gap:8px}.propertyAssignedPerson{border:1px solid var(--line);border-radius:10px;padding:9px 11px;background:#fbfcfe}.propertyAssignedPerson strong,.propertyAssignedPerson small{display:block}.propertyAssignedPerson small{color:var(--muted);font-size:10px}.propertyAssignmentManager{margin-top:22px;padding-top:18px;border-top:1px solid var(--line)}.propertyAssignmentChecklist{display:grid;gap:5px}.propertyAssignmentCheck{display:grid;grid-template-columns:18px 1fr;gap:8px;margin:0;padding:7px 8px;border:1px solid #edf0f4;border-radius:8px;background:#fbfcfe}.propertyAssignmentCheck input{width:14px;height:14px;min-height:0;margin:2px 0 0}.propertyAssignmentCheck strong,.propertyAssignmentCheck small{display:block}.propertyAssignmentCheck strong{font-size:12px}.propertyAssignmentCheck small{font-size:9px;color:var(--muted)}
.personnelDocumentPreview{display:flex;align-items:center;gap:8px}.personnelDocumentThumb{width:48px;height:48px;border:1px solid var(--line);border-radius:7px;overflow:hidden;background:#f1f5f9;display:grid;place-items:center;flex:0 0 auto}.personnelDocumentThumb img{width:100%;height:100%;object-fit:cover}.personnelDocumentThumb.pdf{font-size:10px;font-weight:800;color:#b91c1c}.personnelDocumentThumb.file{font-size:9px;font-weight:800;color:#64748b}.reportedWorkTable td{vertical-align:top}
@media(max-width:1180px){.dashboardOverviewGrid{grid-template-columns:1fr}.dashboardTopGrid{grid-template-columns:1fr}.workforceTableWrap{overflow-x:auto}.workforceTable{min-width:760px}}@media(max-width:760px){.summaryMetricGrid,.propertyTeamColumns{grid-template-columns:1fr}.featuredEvidence{grid-template-columns:1fr}.evidenceFeaturePanel.expanded{left:10px;right:10px;top:74px}.evidenceFeaturePanel.expanded .featuredEvidence{grid-template-columns:1fr}}
'''
if marker not in t:t+="\n"+block
p.write_text(t)

p=Path("src/components/PersonnelProfileManager.tsx");t=p.read_text()
old='<td>{d.signedUrl?<a href={d.signedUrl} target="_blank" rel="noreferrer">{d.fileName}</a>:d.fileName}</td>'
new='<td><div className="personnelDocumentPreview">{d.signedUrl?<a className={`personnelDocumentThumb ${d.mimeType==="application/pdf"?"pdf":d.mimeType?.startsWith("image/")?"":"file"}`} href={d.signedUrl} target="_blank" rel="noreferrer">{d.mimeType?.startsWith("image/")?<img src={d.signedUrl} alt={d.fileName}/>:d.mimeType==="application/pdf"?"PDF":"FILE"}</a>:<span className="personnelDocumentThumb file">FILE</span>}<span>{d.signedUrl?<a href={d.signedUrl} target="_blank" rel="noreferrer">{d.fileName}</a>:d.fileName}</span></div></td>'
t=once(t,old,new,"Personnel document preview");p.write_text(t)

p=Path("PROJECT-CONTEXT.md");t=p.read_text()
section='''
## Fine-tuning Batch 03 — Cumulative Operations / Properties / Reported Work
- Dashboard: standalone Users Online KPI removed; `X online / Y users` moved to `Who is active now`.
- Dashboard KPIs consolidated into one operational summary panel.
- Recent Evidence moved to the top, one photo/video at a time, rotating every 30 seconds, with maximize/minimize overlay and expanded horizontal thumbnail strip.
- Lower Evidence carousel removed. Live Workforce desktop density tightened; responsive scrolling retained when needed.
- Dashboard data is Property-scoped for Property Managers.
- Properties: `Property Details | Work Areas | Team Assignments` retained; Team Assignments now role-separated into Property Managers and Users with compact Admin assignment checklists and contact context; PM remains read-only.
- New mobile Task/Schedule notes create explicit `ReportedWorkItem` records and surface in Dashboard Attention Required.
- Admin can action all reports; PM only assigned Properties; User cannot action them.
- Create Schedule from a report is prefilled to Work Area and defaults One Time; recurring remains selectable. Resulting Schedule is explicitly linked.
- Dismissal is historical, not deletion; dismissed items remain in Reports and can later create a Schedule while preserving dismissal history.
- Reports adds `Reported Notes / Work Requests` with reporter/time/Property/Work Area/context/note/status/history/resulting Schedule.
- Audit adds Entity Type/Entity ID dropdown filtering, rows/page 25/50/75/100 (default 50), range/page footer, and prospective request IP/user-agent/request-id capture.
- Personnel document display adds image thumbnails and PDF/file placeholders linked to signed files.
- Automated regression rule: Requirement → implementation → automated test coverage → regression suite update → PROJECT-CONTEXT update.
- Batch 03 adds automated Reported Work tests. RLS remains deferred and is NOT enabled in this batch.
'''
if "## Fine-tuning Batch 03 — Cumulative Operations / Properties / Reported Work" not in t:t+="\n\n"+section
p.write_text(t)
print("UI/context patches applied.")
