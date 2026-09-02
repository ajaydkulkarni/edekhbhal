import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function write(rel, content) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content);
  console.log(`Wrote ${rel}`);
}
function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly 1 match, found ${count}`);
  return text.replace(from, to);
}
function replaceRegexOnce(text, regex, replacement, label) {
  const matches = [...text.matchAll(new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g"))];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly 1 match, found ${matches.length}`);
  return text.replace(regex, replacement);
}
function update(rel, transform) {
  const before = read(rel);
  const after = transform(before);
  if (after === before) throw new Error(`${rel}: no change applied`);
  write(rel, after);
}

// Guard the known restored baseline so this script never silently targets the wrong branch state.
const schemaBaseline = read("prisma/schema.prisma");
if (!schemaBaseline.includes('model Schedule {') || schemaBaseline.includes('documentReference          String?')) {
  throw new Error("This script expects the restored v2-rebuild baseline before Combined Build 02. prisma/schema.prisma does not match that state.");
}

// 1) Prisma schema: controlled-document master fields + occurrence snapshots.
update("prisma/schema.prisma", (source) => {
  let out = source;
  out = replaceOnce(
    out,
    '  name                       String                  @db.VarChar(500)\n  frequencyType              ScheduleFrequencyType',
    '  name                       String                  @db.VarChar(500)\n  documentReference          String?                 @db.VarChar(150)\n  documentRevision           String?                 @db.VarChar(100)\n  frequencyType              ScheduleFrequencyType',
    "Schedule document-control fields"
  );
  out = replaceOnce(
    out,
    '  scheduleNameSnapshot   String                   @db.VarChar(500)\n  workAreaNameSnapshot   String                   @db.VarChar(500)',
    '  scheduleNameSnapshot        String                   @db.VarChar(500)\n  documentReferenceSnapshot String?                  @db.VarChar(150)\n  documentRevisionSnapshot  String?                  @db.VarChar(100)\n  workAreaNameSnapshot       String                   @db.VarChar(500)',
    "ScheduleOccurrence document snapshots"
  );
  return out;
});

// 2) Schedule create API.
update("src/app/api/schedules/route.ts", (source) => {
  let out = source;
  out = replaceOnce(out,
    ' name:z.string().trim().min(2).max(500),\n frequencyType:',
    ' name:z.string().trim().min(2).max(500),\n documentReference:z.string().trim().max(150).nullable().optional(),\n documentRevision:z.string().trim().max(100).nullable().optional(),\n frequencyType:',
    "Schedule POST validation fields");
  out = replaceOnce(out,
    'organizationId:membership.organizationId,name:input.name,frequencyType:',
    'organizationId:membership.organizationId,name:input.name,documentReference:input.documentReference||null,documentRevision:input.documentRevision||null,frequencyType:',
    "Schedule POST persistence fields");
  out = replaceOnce(out,
    'newValue:{name:created.name,frequencyType:',
    'newValue:{name:created.name,documentReference:created.documentReference,documentRevision:created.documentRevision,frequencyType:',
    "Schedule POST audit fields");
  return out;
});

// 3) Schedule update API: validation, persistence and audit snapshots.
update("src/app/api/schedules/[id]/route.ts", (source) => {
  let out = source;
  out = replaceOnce(out,
    '  name: z.string().trim().min(2).max(500),\n  frequencyType:',
    '  name: z.string().trim().min(2).max(500),\n  documentReference: z.string().trim().max(150).nullable().optional(),\n  documentRevision: z.string().trim().max(100).nullable().optional(),\n  frequencyType:',
    "Schedule PATCH validation fields");
  out = replaceOnce(out,
    '    name: schedule.name,\n    frequencyType:',
    '    name: schedule.name,\n    documentReference: schedule.documentReference,\n    documentRevision: schedule.documentRevision,\n    frequencyType:',
    "Schedule audit snapshot fields");
  out = replaceOnce(out,
    '          name: input.name,\n          frequencyType:',
    '          name: input.name,\n          documentReference: input.documentReference || null,\n          documentRevision: input.documentRevision || null,\n          frequencyType:',
    "Schedule PATCH persistence fields");
  return out;
});

// 4) Duplicate Schedule carries document control forward.
update("src/app/api/schedules/[id]/duplicate/route.ts", (source) => {
  let out = source;
  out = replaceOnce(out,
    '          name: `${source.name} — Copy`,\n          frequencyType:',
    '          name: `${source.name} — Copy`,\n          documentReference: source.documentReference,\n          documentRevision: source.documentRevision,\n          frequencyType:',
    "Schedule duplicate persistence fields");
  out = replaceOnce(out,
    'newValue: { name: schedule.name, workAreaId: schedule.workAreaId, frequencyType: schedule.frequencyType }',
    'newValue: { name: schedule.name, documentReference: schedule.documentReference, documentRevision: schedule.documentRevision, workAreaId: schedule.workAreaId, frequencyType: schedule.frequencyType }',
    "Schedule duplicate audit fields");
  return out;
});

// 5) Occurrence generation snapshots the document reference/revision.
update("src/lib/occurrenceGenerator.ts", (source) => replaceOnce(
  source,
  '        scheduleNameSnapshot: schedule.name, workAreaNameSnapshot: schedule.workArea.name,\n        propertyNameSnapshot: schedule.workArea.property.name, plannedDurationMinutes: totalDuration',
  '        scheduleNameSnapshot: schedule.name,\n        documentReferenceSnapshot: schedule.documentReference,\n        documentRevisionSnapshot: schedule.documentRevision,\n        workAreaNameSnapshot: schedule.workArea.name,\n        propertyNameSnapshot: schedule.workArea.property.name, plannedDurationMinutes: totalDuration',
  "Occurrence document snapshots"
));

// 6) Schedule editor fields.
update("src/components/ScheduleEditor.tsx", (source) => {
  let out = source;
  out = replaceOnce(out,
    'type InitialSchedule={id:string;name:string;frequencyType:',
    'type InitialSchedule={id:string;name:string;documentReference:string|null;documentRevision:string|null;frequencyType:',
    "ScheduleEditor InitialSchedule fields");
  out = replaceOnce(out,
    ' const [name,setName]=useState(initial?.name??defaults?.suggestedName??"");\n const [frequencyType',
    ' const [name,setName]=useState(initial?.name??defaults?.suggestedName??"");\n const [documentReference,setDocumentReference]=useState(initial?.documentReference??"");\n const [documentRevision,setDocumentRevision]=useState(initial?.documentRevision??"");\n const [frequencyType',
    "ScheduleEditor state fields");
  out = replaceOnce(out,
    'const payload={name:name.trim(),frequencyType,',
    'const payload={name:name.trim(),documentReference:documentReference.trim()||null,documentRevision:documentRevision.trim()||null,frequencyType,',
    "ScheduleEditor payload fields");
  out = replaceOnce(out,
    '<div className="builderStep"><span>1</span><div><strong>Where</strong><small>Choose the location where this work will happen.</small></div></div>',
    '<div className="builderStep"><span>1</span><div><strong>Where & document control</strong><small>Choose the location and, when applicable, identify the controlled checklist / SOP.</small></div></div>',
    "ScheduleEditor step-one heading");
  out = replaceOnce(out,
    '    <label>Work Area<select value={workAreaId} onChange={e=>setWorkAreaId(e.target.value)} disabled={!canManage}><option value="">Select Work Area</option>{workAreas.map(wa=>{const selectable=wa.status==="ACTIVE"&&wa.propertyStatus==="ACTIVE";const retained=initial?.workAreaId===wa.id;if(!selectable&&!retained)return null;return <option key={wa.id} value={wa.id}>{wa.name} — {wa.propertyName}{selectable?"":" (Inactive)"}</option>})}</select><small className="muted">Property context is shown with every Work Area.</small></label>\n   </div>',
    '    <label>Work Area<select value={workAreaId} onChange={e=>setWorkAreaId(e.target.value)} disabled={!canManage}><option value="">Select Work Area</option>{workAreas.map(wa=>{const selectable=wa.status==="ACTIVE"&&wa.propertyStatus==="ACTIVE";const retained=initial?.workAreaId===wa.id;if(!selectable&&!retained)return null;return <option key={wa.id} value={wa.id}>{wa.name} — {wa.propertyName}{selectable?"":" (Inactive)"}</option>})}</select><small className="muted">Property context is shown with every Work Area.</small></label>\n    <label>Document / SOP Reference No.<input maxLength={150} value={documentReference} onChange={e=>setDocumentReference(e.target.value)} disabled={!canManage} placeholder="e.g. QMS-PRD-017"/><small className="muted">Optional controlled-document or checklist reference shown in operational reports.</small></label>\n    <label>Revision / Version<input maxLength={100} value={documentRevision} onChange={e=>setDocumentRevision(e.target.value)} disabled={!canManage} placeholder="e.g. Rev 03"/><small className="muted">Snapshotted into generated occurrences so historical reports keep the version actually used.</small></label>\n   </div>',
    "ScheduleEditor document-control inputs");
  return out;
});

// 7) Schedule detail initializes the editor with document-control values and surfaces them near the title.
update("src/app/schedules/[id]/page.tsx", (source) => {
  let out = source;
  out = replaceOnce(out,
    '    name: schedule.name,\n    frequencyType:',
    '    name: schedule.name,\n    documentReference: schedule.documentReference,\n    documentRevision: schedule.documentRevision,\n    frequencyType:',
    "Schedule detail InitialSchedule fields");
  out = replaceOnce(out,
    '    <p className="muted">First occurrence: {formatInZone(schedule.startAt, schedule.timezone)} ({schedule.timezone})</p>',
    '    <p className="muted">First occurrence: {formatInZone(schedule.startAt, schedule.timezone)} ({schedule.timezone})</p>\n    {(schedule.documentReference || schedule.documentRevision) && <p><strong>Controlled document:</strong> {schedule.documentReference || "—"} · {schedule.documentRevision || "—"}</p>}',
    "Schedule detail controlled-document summary");
  return out;
});

// 8) Schedule list columns.
update("src/app/schedules/page.tsx", (source) => {
  let out = source;
  out = replaceOnce(out,
    '<p className="muted">Plan recurring or one-time work for individual Work Areas.</p>',
    '<p className="muted">Plan recurring or one-time work for individual Work Areas, with optional controlled-document reference and revision.</p>',
    "Schedule list description");
  out = replaceOnce(out,
    '<thead><tr><th>Schedule</th><th>Frequency</th><th>Starts</th><th>Work Area / Property</th><th>Tasks</th><th>Planned Duration</th><th>Status</th><th></th></tr></thead>',
    '<thead><tr><th>Schedule</th><th>Document Ref.</th><th>Revision</th><th>Frequency</th><th>Starts</th><th>Work Area / Property</th><th>Tasks</th><th>Planned Duration</th><th>Status</th><th></th></tr></thead>',
    "Schedule list headers");
  out = replaceOnce(out,
    '<td style={{ maxWidth: 300 }}><strong>{schedule.name}</strong></td>\n              <td>{recurrenceLabel',
    '<td style={{ maxWidth: 300 }}><strong>{schedule.name}</strong></td>\n              <td>{schedule.documentReference ?? "—"}</td>\n              <td>{schedule.documentRevision ?? "—"}</td>\n              <td>{recurrenceLabel',
    "Schedule list document values");
  out = replaceOnce(out, 'colSpan={8}', 'colSpan={10}', "Schedule list empty colspan");
  return out;
});

// 9) Service Log: occurrence-snapshot document fields.
update("src/app/reports/service-log/page.tsx", (source) => {
  let out = source;
  out = replaceOnce(out,
    '      taskList: occurrence.scheduleNameSnapshot,\n      sequence:',
    '      taskList: occurrence.scheduleNameSnapshot,\n      documentReference: occurrence.documentReferenceSnapshot ?? "—",\n      documentRevision: occurrence.documentRevisionSnapshot ?? "—",\n      sequence:',
    "Service Log row document fields");
  out = replaceOnce(out,
    '          One row per completed Task performance. Times are shown in the Schedule occurrence timezone.',
    '          One row per completed Task performance. Document / SOP reference and revision come from the occurrence snapshot. Times are shown in the Schedule occurrence timezone.',
    "Service Log description");
  return out;
});

update("src/app/reports/service-log/SortableServiceLogTable.tsx", (source) => {
  let out = source;
  out = replaceOnce(out,
    '  taskList: string;\n  sequence:',
    '  taskList: string;\n  documentReference: string;\n  documentRevision: string;\n  sequence:',
    "Service Log row type fields");
  out = replaceOnce(out,
    '  | "taskList"\n  | "sequence"',
    '  | "taskList"\n  | "documentReference"\n  | "documentRevision"\n  | "sequence"',
    "Service Log SortKey document fields");
  out = replaceOnce(out,
    '  { label: "Task List", key: "taskList" },\n  { label: "Sr. No.", key: "sequence" },',
    '  { label: "Task List", key: "taskList" },\n  { label: "Document Ref.", key: "documentReference" },\n  { label: "Revision", key: "documentRevision" },\n  { label: "Sr. No.", key: "sequence" },',
    "Service Log headers");
  out = replaceOnce(out,
    '<table className="table" style={{ minWidth: 1500 }}>',
    '<table className="table" style={{ minWidth: 1750 }}>',
    "Service Log table width");
  out = replaceOnce(out,
    '                <td>{row.taskList}</td>\n                <td>{row.sequence}</td>',
    '                <td>{row.taskList}</td>\n                <td>{row.documentReference}</td>\n                <td>{row.documentRevision}</td>\n                <td>{row.sequence}</td>',
    "Service Log table document cells");
  out = replaceOnce(out, 'colSpan={12}', 'colSpan={14}', "Service Log empty colspan");
  return out;
});

// 10) CSV/XLSX Service Log export.
update("src/app/api/reports/service-log/export/route.ts", (source) => {
  let out = source;
  out = replaceOnce(out,
    '      Schedule: o.scheduleNameSnapshot,\n      Sequence:',
    '      Schedule: o.scheduleNameSnapshot,\n      "Document Reference": o.documentReferenceSnapshot ?? "",\n      "Revision / Version": o.documentRevisionSnapshot ?? "",\n      Sequence:',
    "Service Log export document columns");
  out = replaceOnce(out,
    '      Schedule: "",\n      Sequence: "",',
    '      Schedule: "",\n      "Document Reference": "",\n      "Revision / Version": "",\n      Sequence: "",',
    "Service Log empty-export headers");
  return out;
});

// 11) Compliance occurrence-detail table and drill-down page.
update("src/app/reports/compliance/page.tsx", (source) => {
  let out = source;
  out = replaceOnce(out,
    '                <th>Schedule</th>\n                <th>Status</th>',
    '                <th>Schedule</th>\n                <th>Document Ref.</th>\n                <th>Revision</th>\n                <th>Status</th>',
    "Compliance document headers");
  out = replaceOnce(out,
    '                  <td>{o.scheduleNameSnapshot}</td>\n                  <td>{o.status.replaceAll',
    '                  <td>{o.scheduleNameSnapshot}</td>\n                  <td>{o.documentReferenceSnapshot ?? "—"}</td>\n                  <td>{o.documentRevisionSnapshot ?? "—"}</td>\n                  <td>{o.status.replaceAll',
    "Compliance document cells");
  out = replaceOnce(out, 'colSpan={8}', 'colSpan={10}', "Compliance empty colspan");
  return out;
});

update("src/app/reports/occurrences/[id]/page.tsx", (source) => replaceOnce(
  source,
  '            <Fact label="Status" value={occurrence.status.replaceAll("_", " ")} />\n            <Fact',
  '            <Fact label="Status" value={occurrence.status.replaceAll("_", " ")} />\n            <Fact label="Document / SOP Reference No." value={occurrence.documentReferenceSnapshot ?? "—"} />\n            <Fact label="Revision / Version" value={occurrence.documentRevisionSnapshot ?? "—"} />\n            <Fact',
  "Occurrence detail document Facts"
));

// 12) Dashboard action queue refreshes immediately when page/tab resumes.
update("src/components/dashboard/LiveOperationsDashboard.tsx", (source) => {
  let out = source;
  out = replaceOnce(out,
    '    void load();\n    const poll = setInterval(() => void load(), POLL_MS);\n    const clock = setInterval(() => setNowMs(Date.now()), 1000);\n    return () => {\n      cancelled = true;\n      clearInterval(poll);\n      clearInterval(clock);\n    };',
    '    void load();\n    const poll = setInterval(() => void load(), POLL_MS);\n    const clock = setInterval(() => setNowMs(Date.now()), 1000);\n    const resume = () => void load();\n    const visibility = () => { if (document.visibilityState === "visible") void load(); };\n    window.addEventListener("focus", resume);\n    window.addEventListener("pageshow", resume);\n    document.addEventListener("visibilitychange", visibility);\n    return () => {\n      cancelled = true;\n      clearInterval(poll);\n      clearInterval(clock);\n      window.removeEventListener("focus", resume);\n      window.removeEventListener("pageshow", resume);\n      document.removeEventListener("visibilitychange", visibility);\n    };',
    "Dashboard resume refresh listeners");
  return out;
});

// 13) Zebra-friendly 4x6 Work Area QR label, no visible QR ID.
update("src/app/work-areas/page.tsx", (source) => {
  let out = source;
  out = replaceOnce(out,
    '    where: { userId: user.id, status: "ACTIVE" }\n  });',
    '    where: { userId: user.id, status: "ACTIVE" },\n    include: { organization: true }\n  });',
    "Work Areas membership organization include");
  out = replaceOnce(out,
    '<WorkAreaRowActions workArea={wa} />',
    '<WorkAreaRowActions workArea={wa} organizationName={membership.organization.name} />',
    "Work Area QR organization prop");
  return out;
});

update("src/components/WorkAreaRowActions.tsx", (source) => {
  let out = source;
  out = replaceOnce(out,
    'import { useRouter } from "next/navigation";\n',
    'import { useRouter } from "next/navigation";\nimport { PRODUCT_NAME, QR_SCAN_PROMPT } from "@/lib/productBrand";\n',
    "QR brand import");
  out = replaceOnce(out,
    '  qrId: string;\n  dataUrl: string;',
    '  organizationName: string;\n  dataUrl: string;',
    "QrView organization field");
  out = replaceOnce(out,
    'export function WorkAreaRowActions({ workArea }: { workArea: any }) {',
    'export function WorkAreaRowActions({ workArea, organizationName }: { workArea: any; organizationName: string }) {',
    "WorkAreaRowActions signature");
  out = replaceOnce(out,
    '        propertyName,\n        qrId: d.qr.id,\n        dataUrl: d.qr.dataUrl',
    '        propertyName,\n        organizationName,\n        dataUrl: d.qr.dataUrl',
    "QR view state");

  out = replaceRegexOnce(out,
    /  function printQr\(\) \{[\s\S]*?\n  \}\n\n  return \(/,
`  function printQr() {
    if (!qr) return;
    const w = window.open("", "_blank", "width=520,height=760");
    if (!w) return;
    const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    w.document.write(\`<!doctype html><html><head><meta charset="utf-8"><title>\${esc(qr.workAreaName)} QR Label</title><style>
      @page{size:4in 6in;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:4in;height:6in;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}.label{width:4in;height:6in;padding:.20in .22in .18in;display:flex;flex-direction:column;align-items:center;text-align:center;overflow:hidden}.product{font-size:28pt;font-weight:900;line-height:1.05;margin:0 0 .08in}.org{font-size:17pt;font-weight:800;line-height:1.12;max-height:.55in;overflow:hidden}.property{font-size:15pt;font-weight:700;line-height:1.12;margin-top:.06in;max-height:.48in;overflow:hidden}.area{font-size:18pt;font-weight:900;line-height:1.1;margin-top:.08in;max-height:.62in;overflow:hidden}.qr{width:2.75in;height:2.75in;object-fit:contain;margin:auto 0 .06in}.scan{font-size:16pt;font-weight:900;line-height:1.15;margin:.04in 0 0}@media print{button{display:none}}
    </style></head><body><div class="label"><div class="product">\${esc(PRODUCT_NAME)}</div><div class="org">\${esc(qr.organizationName)}</div><div class="property">\${esc(qr.propertyName)}</div><div class="area">\${esc(qr.workAreaName)}</div><img class="qr" src="\${qr.dataUrl}" alt="QR"><div class="scan">\${esc(QR_SCAN_PROMPT)}</div></div><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>\`);
    w.document.close();
    w.focus();
  }

  return (`,
    "4x6 Zebra QR print function");

  out = replaceOnce(out,
    '            <p className="mono">QR ID: {qr.qrId}</p>',
    '            <p className="muted">The printed label contains no internal QR ID.</p>\n            <strong>{QR_SCAN_PROMPT}</strong>',
    "QR modal hide internal ID");
  out = replaceOnce(out,
    '                Print QR',
    '                Print 4 × 6 Label',
    "QR print button label");
  return out;
});

// 14) Demo controlled-document mapping and real-world reference photographs.
write("src/lib/productBrand.ts", `export const PRODUCT_NAME = "eDekhbhal";\nexport const QR_SCAN_PROMPT = "Scan for Service Information";\n`);
write("src/lib/demoDocumentControl.ts", `const DEMO_DOCUMENT_CONTROL: Record<string, { documentReference: string; documentRevision: string }> = {
  "hotel-room-turn": { documentReference: "HSP-HK-CHK-014", documentRevision: "Rev 05" },
  "hotel-lobby-open": { documentReference: "HSP-FO-CHK-003", documentRevision: "Rev 02" },
  "hotel-kitchen-close": { documentReference: "HSP-FB-SOP-011", documentRevision: "Rev 04" },
  "lot-butter-chicken": { documentReference: "FS-QMS-PRD-021", documentRevision: "Rev 04" },
  "lot-delight-cookies": { documentReference: "FS-QMS-BAK-017", documentRevision: "Rev 03" },
  "boiler-pm-weekly": { documentReference: "ENG-PM-BLR-007", documentRevision: "Rev 06" },
  "compressor-pm-monthly": { documentReference: "ENG-PM-AIR-004", documentRevision: "Rev 03" },
  "packaging-breakdown": { documentReference: "ENG-BD-RSP-002", documentRevision: "Rev 02" },
  "hq-meeting-readiness": { documentReference: "FAC-OPS-CHK-009", documentRevision: "Rev 04" },
  "hq-pantry": { documentReference: "FAC-HYG-CHK-006", documentRevision: "Rev 03" },
};
export function getDemoDocumentControl(scheduleId: string) {
  return DEMO_DOCUMENT_CONTROL[scheduleId] ?? { documentReference: "DEMO-QMS-CHK-001", documentRevision: "Rev 01" };
}
`);

const demoPhotos = {
  '/demo/evidence/food-line.svg': 'https://images.pexels.com/photos/5953831/pexels-photo-5953831.jpeg?auto=compress&cs=tinysrgb&w=1200',
  '/demo/evidence/hotel-room.svg': 'https://images.pexels.com/photos/9462786/pexels-photo-9462786.jpeg?auto=compress&cs=tinysrgb&w=1200',
  '/demo/evidence/maintenance.svg': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/US_Navy_080225-N-5484G-002_Hull_Maintenance_Technician_2nd_Class_William_Clark_performs_a_braze_qualification_test_in_the_machine_shop_of_the_aircraft_carrier_USS_Nimitz_%28CVN_68%29.jpg/960px-US_Navy_080225-N-5484G-002_Hull_Maintenance_Technician_2nd_Class_William_Clark_performs_a_braze_qualification_test_in_the_machine_shop_of_the_aircraft_carrier_USS_Nimitz_%28CVN_68%29.jpg',
  '/demo/evidence/office.svg': 'https://images.pexels.com/photos/26834971/pexels-photo-26834971.jpeg?auto=compress&cs=tinysrgb&w=1200',
};
update("src/components/demo/DemoLiveOperationsDashboard.tsx", (source) => {
  let out = source;
  for (const [from, to] of Object.entries(demoPhotos)) {
    out = replaceOnce(out, `signedUrl: "${from}"`, `signedUrl: "${to}"`, `Demo photo ${from}`);
  }
  out = replaceOnce(out,
    '<span className="eyebrow">Recent evidence</span>',
    '<span className="eyebrow">Sample evidence · real-world reference photos</span>',
    "Demo evidence disclosure");
  return out;
});

// Demo Schedule list and Reports parity.
update("src/app/demo/[section]/page.tsx", (source) => {
  let out = source;
  out = replaceOnce(out,
    'import { getDemoViewRole } from "@/lib/demoRole";',
    'import { getDemoViewRole } from "@/lib/demoRole";\nimport { getDemoDocumentControl } from "@/lib/demoDocumentControl";',
    "Demo document import");
  out = replaceOnce(out,
    '<thead><tr><th>Schedule</th><th>Frequency</th><th>Work Area / Property</th><th>Tasks</th><th>Planned Duration</th><th>Status</th><th></th></tr></thead>',
    '<thead><tr><th>Schedule</th><th>Document Ref.</th><th>Revision</th><th>Frequency</th><th>Work Area / Property</th><th>Tasks</th><th>Planned Duration</th><th>Status</th><th></th></tr></thead>',
    "Demo Schedule list headers");
  out = replaceOnce(out,
    'return <tr key={schedule.id}><td><strong>{schedule.name}</strong></td><td>{schedule.cadence}</td><td><strong>{workArea.name}</strong><br/><span className="muted">{property.name}</span></td><td>{schedule.taskIds.length}</td><td>{minutesToDemoDuration(getDemoScheduleTotalMinutes(schedule.id))}</td><td>{schedule.status}</td><td><Link className="button small secondary" href={`/demo/schedules/${schedule.id}`}>View</Link></td></tr>;',
    'const document=getDemoDocumentControl(schedule.id); return <tr key={schedule.id}><td><strong>{schedule.name}</strong></td><td>{document.documentReference}</td><td>{document.documentRevision}</td><td>{schedule.cadence}</td><td><strong>{workArea.name}</strong><br/><span className="muted">{property.name}</span></td><td>{schedule.taskIds.length}</td><td>{minutesToDemoDuration(getDemoScheduleTotalMinutes(schedule.id))}</td><td>{schedule.status}</td><td><Link className="button small secondary" href={`/demo/schedules/${schedule.id}`}>View</Link></td></tr>;',
    "Demo Schedule list values");
  out = replaceOnce(out,
    '<thead><tr><th>Date</th><th>Schedule</th><th>Property</th><th>Status</th><th>Exception</th><th></th></tr></thead><tbody>{report.exceptions.map((e)=><tr key={e.id}><td>{e.dateKey}</td><td>{e.scheduleName}</td><td>{e.propertyName}</td><td>{statusLabel(e.status)}</td><td>{e.exception}</td><td><Link href={`/demo/schedules/${e.scheduleId}`}>Open</Link></td></tr>)}</tbody>',
    '<thead><tr><th>Date</th><th>Schedule</th><th>Document Ref.</th><th>Revision</th><th>Property</th><th>Status</th><th>Exception</th><th></th></tr></thead><tbody>{report.exceptions.map((e)=>{const document=getDemoDocumentControl(e.scheduleId);return <tr key={e.id}><td>{e.dateKey}</td><td>{e.scheduleName}</td><td>{document.documentReference}</td><td>{document.documentRevision}</td><td>{e.propertyName}</td><td>{statusLabel(e.status)}</td><td>{e.exception}</td><td><Link href={`/demo/schedules/${e.scheduleId}`}>Open</Link></td></tr>})}</tbody>',
    "Demo Reports document columns");
  return out;
});

// Demo Schedule detail parity.
update("src/app/demo/schedules/[id]/page.tsx", (source) => {
  let out = source;
  out = replaceOnce(out,
    '} from "@/lib/demoWorkspace";\n',
    '} from "@/lib/demoWorkspace";\nimport { getDemoDocumentControl } from "@/lib/demoDocumentControl";\n',
    "Demo Schedule detail document import");
  out = replaceOnce(out,
    '  const total=getDemoScheduleTotalMinutes(schedule.id);',
    '  const total=getDemoScheduleTotalMinutes(schedule.id);\n  const document=getDemoDocumentControl(schedule.id);',
    "Demo Schedule detail document variable");
  out = replaceOnce(out,
    '<Link className="button secondary" href={`/demo-qr/${waFound.workArea.id}`} target="_blank">Open public Demo QR page</Link>',
    '<div className="row wrap"><Link className="button secondary" href={`/demo-qr/${waFound.workArea.id}`} target="_blank">Open public Demo QR page</Link><Link className="button secondary" href={`/demo/work-areas/${waFound.workArea.id}/qr-label`}>Preview 4 × 6 QR Label</Link></div>',
    "Demo Schedule QR label link");
  out = replaceOnce(out,
    '<label>Schedule Name<input value={schedule.name} readOnly/></label>\n        <label>Schedule Frequency',
    '<label>Schedule Name<input value={schedule.name} readOnly/></label>\n        <label>Document / SOP Reference No.<input value={document.documentReference} readOnly/></label>\n        <label>Revision / Version<input value={document.documentRevision} readOnly/></label>\n        <label>Schedule Frequency',
    "Demo Schedule document fields");
  out = replaceOnce(out,
    '<thead><tr><th>Date</th><th>Planned Duration</th><th>Actual Duration</th><th>User</th><th>Status</th><th>Exception</th></tr></thead>',
    '<thead><tr><th>Date</th><th>Document Ref.</th><th>Revision</th><th>Planned Duration</th><th>Actual Duration</th><th>User</th><th>Status</th><th>Exception</th></tr></thead>',
    "Demo occurrence document headers");
  out = replaceOnce(out,
    '{occurrences.map((o)=><tr key={o.id}><td>{o.dateKey}</td><td>{o.plannedMinutes} min</td>',
    '{occurrences.map((o)=><tr key={o.id}><td>{o.dateKey}</td><td>{document.documentReference}</td><td>{document.documentRevision}</td><td>{o.plannedMinutes} min</td>',
    "Demo occurrence document cells");
  return out;
});

// Demo Work Area link to printable 4x6 label.
update("src/app/demo/work-areas/[id]/page.tsx", (source) => replaceOnce(
  source,
  '<div><Link className="button secondary" href={`/demo-qr/${workArea.id}`} target="_blank">Open Demo Public QR</Link></div>',
  '<div className="row wrap"><Link className="button secondary" href={`/demo-qr/${workArea.id}`} target="_blank">Open Demo Public QR</Link><Link className="button secondary" href={`/demo/work-areas/${workArea.id}/qr-label`}>Preview 4 × 6 QR Label</Link></div>',
  "Demo Work Area QR label link"
));

write("src/components/demo/DemoQrLabel.tsx", `"use client";
import { PRODUCT_NAME, QR_SCAN_PROMPT } from "@/lib/productBrand";
export function DemoQrLabel({organizationName,propertyName,workAreaName,qrDataUrl}:{organizationName:string;propertyName:string;workAreaName:string;qrDataUrl:string}){
  return <div><button className="button secondary" type="button" onClick={()=>window.print()}>Print 4 × 6 Demo Label</button><div className="demoPrintQrLabel"><div className="product">{PRODUCT_NAME}</div><div className="organization">{organizationName}</div><div className="property">{propertyName}</div><div className="area">{workAreaName}</div><img src={qrDataUrl} alt={\`Demo QR for \${workAreaName}\`}/><div className="scan">{QR_SCAN_PROMPT}</div><small>DEMO WORKSPACE — Sample data</small></div><style jsx global>{\`@media screen{.demoPrintQrLabel{margin:24px auto;width:4in;min-height:6in;border:1px solid #ddd;padding:.22in;text-align:center;background:#fff;color:#000;display:flex;flex-direction:column;align-items:center}.demoPrintQrLabel .product{font-size:28pt;font-weight:900}.demoPrintQrLabel .organization{font-size:17pt;font-weight:800}.demoPrintQrLabel .property{font-size:15pt;font-weight:700;margin-top:.08in}.demoPrintQrLabel .area{font-size:18pt;font-weight:900;margin-top:.08in}.demoPrintQrLabel img{width:2.75in;height:2.75in;object-fit:contain;margin:auto}.demoPrintQrLabel .scan{font-size:16pt;font-weight:900}}@media print{@page{size:4in 6in;margin:0}body *{visibility:hidden}.demoPrintQrLabel,.demoPrintQrLabel *{visibility:visible}.demoPrintQrLabel{position:absolute;left:0;top:0;margin:0!important;border:0!important;width:4in!important;height:6in!important;padding:.20in .22in .18in!important;text-align:center;background:#fff;color:#000;display:flex!important;flex-direction:column;align-items:center}.demoPrintQrLabel .product{font-size:28pt;font-weight:900}.demoPrintQrLabel .organization{font-size:17pt;font-weight:800}.demoPrintQrLabel .property{font-size:15pt;font-weight:700;margin-top:.06in}.demoPrintQrLabel .area{font-size:18pt;font-weight:900;margin-top:.08in}.demoPrintQrLabel img{width:2.75in;height:2.75in;object-fit:contain;margin:auto 0}.demoPrintQrLabel .scan{font-size:16pt;font-weight:900}.demoPrintQrLabel small{font-size:8pt}}\`}</style></div>;
}
`);

write("src/app/demo/work-areas/[id]/qr-label/page.tsx", `import QRCode from "qrcode";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO_WORKSPACE, findDemoWorkArea } from "@/lib/demoWorkspace";
import { DemoQrLabel } from "@/components/demo/DemoQrLabel";
export default async function DemoQrLabelPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;
  const found=findDemoWorkArea(id);
  if(!found)notFound();
  const base=(process.env.APP_URL||"https://edekhbhal.vercel.app").replace(/\\/$/,"");
  const url=\`${base}/demo-qr/\${encodeURIComponent(id)}\`;
  const qr=await QRCode.toDataURL(url,{width:600,margin:1,errorCorrectionLevel:"M"});
  return <main className="container"><div className="breadcrumbs"><Link href={\`/demo/work-areas/\${id}\`}>Work Area</Link> / QR Label</div><h1>4 × 6 Demo QR Label</h1><p className="muted">Zebra-friendly portrait label preview. No internal QR ID is printed.</p><DemoQrLabel organizationName={DEMO_WORKSPACE.displayName} propertyName={found.property.name} workAreaName={found.workArea.name} qrDataUrl={qr}/></main>;
}
`);

// 15) Regression coverage.
write("e2e/combined-build-02.spec.ts", `import { test, expect } from "@playwright/test";
import { accountEmails, e2eSecret, login, mobileLogin, setupFixtures } from "./helpers";
async function reportedFixture(request:any){const setup:any=await setupFixtures(request);const response=await request.post("/api/e2e/reported-work",{headers:{"x-e2e-secret":e2eSecret()}});expect(response.ok(),await response.text()).toBeTruthy();return{...setup,...(await response.json())} as any;}
function localStart(){const date=new Date(Date.now()+60*60*1000),pad=(n:number)=>String(n).padStart(2,"0");return \`${date.getUTCFullYear()}-\${pad(date.getUTCMonth()+1)}-\${pad(date.getUTCDate())}T\${pad(date.getUTCHours())}:\${pad(date.getUTCMinutes())}\`;}
test.describe("combined build 02",()=>{
 test("Dashboard refresh removes Create Schedule after reported work is linked",async({page,request})=>{const fixture=await reportedFixture(request),token=await mobileLogin(request,accountEmails().user),note=\`[E2E] dashboard resume \${Date.now()}\`;const createdResponse=await request.post(\`/api/mobile/occurrence-tasks/\${fixture.occurrenceTaskA.id}/notes\`,{headers:{Authorization:\`Bearer \${token}\`},data:{note}});expect(createdResponse.ok(),await createdResponse.text()).toBeTruthy();const created=await createdResponse.json();await login(page,accountEmails().admin);await page.goto("/dashboard");const card=page.locator(".reportedWorkAttention").filter({hasText:note});await expect(card).toBeVisible();const scheduleResponse=await page.request.post("/api/schedules",{data:{name:\`[E2E] linked \${Date.now()}\`,documentReference:"QMS-COR-009",documentRevision:"Rev 01",frequencyType:"ONE_TIME",recurrenceUnit:null,recurrenceInterval:null,recurrenceConfig:null,startLocal:localStart(),endDate:null,timezone:"America/Denver",workAreaId:fixture.workAreaA.id,reportedWorkItemId:created.reportedWorkItemId,tasks:[{taskId:fixture.taskA.id,sequence:1,duration:"00:15",evidenceRule:"NONE",randomEveryN:null,randomEvidenceType:null}]}});expect(scheduleResponse.ok(),await scheduleResponse.text()).toBeTruthy();await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(card).toHaveCount(0);});
 test("Schedule document reference and revision can be saved",async({page,request})=>{const fixture=await setupFixtures(request);await login(page,accountEmails().admin);await page.goto(\`/schedules/\${fixture.nextSchedule.id}\`);const reference=\`ISO-E2E-\${Date.now()}\`;await page.getByLabel("Document / SOP Reference No.").fill(reference);await page.getByLabel("Revision / Version").fill("Rev 07");const patch=page.waitForResponse(r=>r.url().includes(\`/api/schedules/\${fixture.nextSchedule.id}\`)&&r.request().method()==="PATCH");await page.getByRole("button",{name:"Save Schedule"}).click();const response=await patch;expect(response.ok(),await response.text()).toBeTruthy();await expect(page.getByLabel("Document / SOP Reference No.")).toHaveValue(reference);await expect(page.getByLabel("Revision / Version")).toHaveValue("Rev 07");});
 test("Work Area QR preview exposes no QR ID and offers 4x6 print",async({page,request})=>{const fixture=await setupFixtures(request);await login(page,accountEmails().admin);await page.goto("/work-areas");const row=page.locator("tbody tr").filter({hasText:fixture.nextWorkArea.name});await row.getByRole("button",{name:"View / Reprint QR"}).click();await expect(page.getByText("Scan for Service Information",{exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Print 4 × 6 Label"})).toBeVisible();await expect(page.getByText(/QR ID:/)).toHaveCount(0);});
 test("Demo shows document control, real reference photos and QR label",async({page})=>{await login(page,accountEmails().admin);await page.goto("/demo/schedules/lot-butter-chicken");await expect(page.getByLabel("Document / SOP Reference No.")).toHaveValue("FS-QMS-PRD-021");await expect(page.getByLabel("Revision / Version")).toHaveValue("Rev 04");await page.goto("/demo/dashboard");await expect(page.getByText("Sample evidence · real-world reference photos",{exact:true})).toBeVisible();await expect(page.locator(".featuredEvidenceMedia img").first()).toHaveAttribute("src",/pexels|wikimedia/);await page.goto("/demo/work-areas/line-1-bowls/qr-label");await expect(page.getByText("Scan for Service Information",{exact:true})).toBeVisible();await expect(page.getByText(/QR ID:/)).toHaveCount(0);await expect(page.getByRole("button",{name:"Print 4 × 6 Demo Label"})).toBeVisible();});
});
`);

console.log("\nCombined Build 02 source changes applied successfully.");
console.log("Next: run the supplied SQL in Supabase, then npm run db:generate && npm run typecheck && npm run build.");
