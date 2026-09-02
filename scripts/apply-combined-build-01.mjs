import fs from "node:fs";

function update(path, transform) {
  const before = fs.readFileSync(path, "utf8");
  const after = transform(before);
  if (after === before) {
    throw new Error(`No change applied to ${path}. The branch may not match the expected v2-rebuild baseline.`);
  }
  fs.writeFileSync(path, after);
  console.log(`Updated ${path}`);
}

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return text.replace(from, to);
}

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
    '  scheduleNameSnapshot        String                   @db.VarChar(500)\n  documentReferenceSnapshot String?                  @db.VarChar(150)\n  documentRevisionSnapshot  String?                  @db.VarChar(100)\n  workAreaNameSnapshot        String                   @db.VarChar(500)',
    "ScheduleOccurrence document snapshots"
  );
  return out;
});

const realPhotoUrls = {
  "/demo/evidence/food-line.svg": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/GD_%E5%BB%A3%E6%9D%B1_Guangdong_%E6%B2%B3%E6%BA%90%E5%B8%82_HeYuan_%E9%AB%98%E6%96%B0%E5%8D%80_High_Tech_Zone_%E8%88%88%E5%B7%A5%E5%8D%97%E8%B7%AF_24_XingGong_South_Road_%E7%99%BE%E5%AE%B6%E9%AE%AE%E9%A3%9F%E5%93%81%E7%A7%91%E6%8A%80_BaiJiaXian_Food_production_line_April_2026_N13P_01.jpg/960px-GD_%E5%BB%A3%E6%9D%B1_Guangdong_%E6%B2%B3%E6%BA%90%E5%B8%82_HeYuan_%E9%AB%98%E6%96%B0%E5%8D%80_High_Tech_Zone_%E8%88%88%E5%B7%A5%E5%8D%97%E8%B7%AF_24_XingGong_South_Road_%E7%99%BE%E5%AE%B6%E9%AE%AE%E9%A3%9F%E5%93%81%E7%A7%91%E6%8A%80_BaiJiaXian_Food_production_line_April_2026_N13P_01.jpg",
  "/demo/evidence/hotel-room.svg": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Bed_in_hotel_room.jpg/960px-Bed_in_hotel_room.jpg",
  "/demo/evidence/maintenance.svg": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/US_Navy_080225-N-5484G-002_Hull_Maintenance_Technician_2nd_Class_William_Clark_performs_a_braze_qualification_test_in_the_machine_shop_of_the_aircraft_carrier_USS_Nimitz_(CVN_68).jpg/960px-US_Navy_080225-N-5484G-002_Hull_Maintenance_Technician_2nd_Class_William_Clark_performs_a_braze_qualification_test_in_the_machine_shop_of_the_aircraft_carrier_USS_Nimitz_(CVN_68).jpg",
  "/demo/evidence/office.svg": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Meeting_room_-_Schloss_Dagstuhl_-_DSC06173.JPG/960px-Meeting_room_-_Schloss_Dagstuhl_-_DSC06173.JPG",
};

update("src/components/demo/DemoLiveOperationsDashboard.tsx", (source) => {
  let out = source;
  for (const [oldUrl, newUrl] of Object.entries(realPhotoUrls)) {
    out = replaceOnce(out, `signedUrl: "${oldUrl}"`, `signedUrl: "${newUrl}"`, `Demo evidence ${oldUrl}`);
  }
  out = replaceOnce(
    out,
    '<span className="eyebrow">Recent evidence</span>',
    '<span className="eyebrow">Sample evidence · real-world reference photos</span>',
    "Demo sample-evidence label"
  );
  return out;
});

update("src/app/demo/[section]/page.tsx", (source) => {
  let out = source;
  out = replaceOnce(
    out,
    'import { getDemoViewRole } from "@/lib/demoRole";',
    'import { getDemoViewRole } from "@/lib/demoRole";\nimport { getDemoDocumentControl } from "@/lib/demoDocumentControl";',
    "Demo document-control import"
  );
  out = replaceOnce(
    out,
    '<thead><tr><th>Schedule</th><th>Frequency</th><th>Work Area / Property</th><th>Tasks</th><th>Planned Duration</th><th>Status</th><th></th></tr></thead>',
    '<thead><tr><th>Schedule</th><th>Document Ref.</th><th>Revision</th><th>Frequency</th><th>Work Area / Property</th><th>Tasks</th><th>Planned Duration</th><th>Status</th><th></th></tr></thead>',
    "Demo schedule-list headers"
  );
  out = replaceOnce(
    out,
    'return <tr key={schedule.id}><td><strong>{schedule.name}</strong></td><td>{schedule.cadence}</td><td><strong>{workArea.name}</strong><br/><span className="muted">{property.name}</span></td><td>{schedule.taskIds.length}</td><td>{minutesToDemoDuration(getDemoScheduleTotalMinutes(schedule.id))}</td><td>{schedule.status}</td><td><Link className="button small secondary" href={`/demo/schedules/${schedule.id}`}>View</Link></td></tr>;',
    'const document=getDemoDocumentControl(schedule.id); return <tr key={schedule.id}><td><strong>{schedule.name}</strong></td><td>{document.documentReference}</td><td>{document.documentRevision}</td><td>{schedule.cadence}</td><td><strong>{workArea.name}</strong><br/><span className="muted">{property.name}</span></td><td>{schedule.taskIds.length}</td><td>{minutesToDemoDuration(getDemoScheduleTotalMinutes(schedule.id))}</td><td>{schedule.status}</td><td><Link className="button small secondary" href={`/demo/schedules/${schedule.id}`}>View</Link></td></tr>;',
    "Demo schedule-list values"
  );
  out = replaceOnce(
    out,
    '<thead><tr><th>Date</th><th>Schedule</th><th>Property</th><th>Status</th><th>Exception</th><th></th></tr></thead><tbody>{report.exceptions.map((e)=><tr key={e.id}><td>{e.dateKey}</td><td>{e.scheduleName}</td><td>{e.propertyName}</td><td>{statusLabel(e.status)}</td><td>{e.exception}</td><td><Link href={`/demo/schedules/${e.scheduleId}`}>Open</Link></td></tr>)}</tbody>',
    '<thead><tr><th>Date</th><th>Schedule</th><th>Document Ref.</th><th>Revision</th><th>Property</th><th>Status</th><th>Exception</th><th></th></tr></thead><tbody>{report.exceptions.map((e)=>{const document=getDemoDocumentControl(e.scheduleId);return <tr key={e.id}><td>{e.dateKey}</td><td>{e.scheduleName}</td><td>{document.documentReference}</td><td>{document.documentRevision}</td><td>{e.propertyName}</td><td>{statusLabel(e.status)}</td><td>{e.exception}</td><td><Link href={`/demo/schedules/${e.scheduleId}`}>Open</Link></td></tr>})}</tbody>',
    "Demo report document-control columns"
  );
  return out;
});

console.log("Combined Build 01 source updates applied successfully.");
