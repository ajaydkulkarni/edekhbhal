export type DemoRole = "ADMIN" | "PROPERTY_MANAGER" | "USER";
export type DemoEventStatus =
  | "COMPLETED_ON_TIME"
  | "COMPLETED_LATE"
  | "IN_PROGRESS"
  | "UPCOMING"
  | "MISSED"
  | "INCOMPLETE";

export type DemoTask = {
  id: string;
  name: string;
  category: string;
  description: string;
  evidence: "NONE" | "PHOTO" | "VIDEO" | "RANDOM";
  status: "ACTIVE";
  attachmentCount: number;
};

export type DemoWorkArea = {
  id: string;
  propertyId: string;
  name: string;
  description: string;
  locationIdentifier: string;
  status: "ACTIVE";
};

export type DemoProperty = {
  id: string;
  name: string;
  industry: string;
  description: string;
  city: string;
  state: string;
  timezone: string;
  status: "ACTIVE";
  workAreas: DemoWorkArea[];
};

export type DemoSchedule = {
  id: string;
  name: string;
  propertyId: string;
  workAreaId: string;
  taskIds: string[];
  cadence: string;
  purpose: string;
  frequencyType: "ONE_TIME" | "RECURRING";
  status: "ACTIVE";
  timezone: string;
};

export type DemoTeamMember = {
  id: string;
  name: string;
  role: DemoRole;
  title: string;
  assignedPropertyIds: string[];
};

export const DEMO_WORKSPACE = {
  id: "best-practice-demo",
  displayName: "eDekhbhal Best Practice Demo",
  timezone: "America/Denver",
  banner: "DEMO WORKSPACE — Sample data",
} as const;

const wa = (propertyId: string, id: string, name: string, description: string, locationIdentifier: string): DemoWorkArea => ({
  id, propertyId, name, description, locationIdentifier, status: "ACTIVE"
});

export const demoProperties: DemoProperty[] = [
  {
    id: "grand-vista-hotel",
    name: "Grand Vista Hotel",
    industry: "Hospitality",
    description: "Guest-room, public-area, kitchen and safety operations.",
    city: "Denver", state: "CO", timezone: "America/Denver", status: "ACTIVE",
    workAreas: [
      wa("grand-vista-hotel","hotel-lobby","Main Lobby","Guest-facing lobby and reception zone.","Ground Floor"),
      wa("grand-vista-hotel","hotel-rooms-floor-4","Guest Rooms — Floor 4","Guest room housekeeping and room-readiness checks.","Floor 4"),
      wa("grand-vista-hotel","hotel-kitchen","Main Kitchen","Food preparation, sanitation and closing controls.","Back of House"),
      wa("grand-vista-hotel","hotel-pool","Pool & Fitness","Guest amenity inspection and sanitation.","Level 2"),
    ],
  },
  {
    id: "freshbite-foods",
    name: "FreshBite Foods Manufacturing Plant",
    industry: "Food Manufacturing",
    description: "Lot-controlled production, sanitation, quality and packaging operations.",
    city: "Aurora", state: "CO", timezone: "America/Denver", status: "ACTIVE",
    workAreas: [
      wa("freshbite-foods","line-1-bowls","Line 1 — Prepared Meals","Butter Chicken Bowl production line.","Production Hall A"),
      wa("freshbite-foods","line-2-cookies","Line 2 — Bakery","Delight Cookies production line.","Production Hall B"),
      wa("freshbite-foods","food-qc-lab","Quality Lab","In-process and finished-goods quality verification.","QC Wing"),
      wa("freshbite-foods","food-sanitation","Sanitation Zone","Pre-op and post-op sanitation controls.","Hygiene Entry"),
    ],
  },
  {
    id: "industrial-maintenance",
    name: "Industrial Maintenance Facility",
    industry: "Maintenance",
    description: "Preventive maintenance, inspections and breakdown-response practices.",
    city: "Lakewood", state: "CO", timezone: "America/Denver", status: "ACTIVE",
    workAreas: [
      wa("industrial-maintenance","maint-boiler","Boiler Room","Boilers, pumps and steam-system assets.","Utility Building"),
      wa("industrial-maintenance","maint-compressor","Compressor Bay","Compressed-air system and dryers.","Utility Building"),
      wa("industrial-maintenance","maint-packaging","Packaging Machine Cell","Conveyors, sealers, motors and sensors.","Line Support Area"),
    ],
  },
  {
    id: "corporate-hq",
    name: "Corporate Headquarters",
    industry: "Corporate Office",
    description: "Facilities, meeting-room, pantry and workplace readiness routines.",
    city: "Denver", state: "CO", timezone: "America/Denver", status: "ACTIVE",
    workAreas: [
      wa("corporate-hq","hq-reception","Reception & Visitor Area","Front-of-house readiness and safety.","Lobby"),
      wa("corporate-hq","hq-meeting","Meeting Rooms","Room reset, AV and consumables.","Floors 2–4"),
      wa("corporate-hq","hq-pantry","Pantry & Break Area","Cleanliness, replenishment and equipment checks.","Floor 3"),
    ],
  },
];

const t = (id:string,name:string,category:string,description:string,evidence:DemoTask["evidence"],attachmentCount=0):DemoTask => ({
  id,name,category,description,evidence,status:"ACTIVE",attachmentCount
});

export const demoTasks: DemoTask[] = [
  t("guest-room-readiness","Guest Room Readiness Inspection","Hospitality","Verify linen, amenities, cleanliness, minibar, bathroom and maintenance exceptions before room release.","RANDOM",2),
  t("lobby-opening","Lobby Opening Readiness","Hospitality","Inspect floors, glass, furniture, lighting, scent, signage and guest-facing supplies.","PHOTO",1),
  t("kitchen-closing","Kitchen Closing Sanitation","Hospitality","Complete food-contact sanitation, waste removal, temperature checks and close-down verification.","PHOTO",2),
  t("pool-safety","Pool & Fitness Safety Inspection","Hospitality","Inspect water-area safety, equipment condition, towels, sanitation and signage.","PHOTO",1),
  t("bc-preop","Butter Chicken Bowl — Pre-Op Sanitation & Line Clearance","Food Manufacturing","Verify pre-operation sanitation release, allergen clearance, prior-lot material removal and line readiness.","PHOTO",2),
  t("bc-material","Butter Chicken Bowl — Material & Lot Verification","Food Manufacturing","Verify approved ingredients, lot codes, expiry status and staged quantities against batch requirements.","NONE",1),
  t("bc-cook","Butter Chicken Bowl — Cooking & Critical Temperature Check","Food Manufacturing","Control cook sequence and verify critical product temperature before filling.","PHOTO",2),
  t("bc-fill","Butter Chicken Bowl — Fill, Seal & Weight Verification","Food Manufacturing","Verify component fill weights, seal integrity and check-weight conformance.","RANDOM",1),
  t("bc-metal","Butter Chicken Bowl — Metal Detection & Label Verification","Food Manufacturing","Complete detector challenge checks and verify product, allergen, lot and date coding.","PHOTO",2),
  t("bc-close","Butter Chicken Bowl — Lot Closeout","Food Manufacturing","Reconcile output, scrap, retained samples, labels and lot documentation.","NONE",1),
  t("cookie-preop","Delight Cookies — Pre-Op Sanitation & Allergen Clearance","Food Manufacturing","Confirm bakery line release, allergen changeover, utensils and contact surfaces.","PHOTO",2),
  t("cookie-weigh","Delight Cookies — Ingredient Weighing & Verification","Food Manufacturing","Verify ingredient identity, lot numbers and weighed quantities before mixing.","NONE",1),
  t("cookie-mix","Delight Cookies — Mixing & Dough Check","Food Manufacturing","Control mixing parameters and verify dough appearance and temperature.","RANDOM",1),
  t("cookie-bake","Delight Cookies — Bake Profile & Quality Check","Food Manufacturing","Verify oven settings, bake time, color, dimensions and finished product condition.","PHOTO",2),
  t("cookie-pack","Delight Cookies — Metal Detection, Packaging & Coding","Food Manufacturing","Challenge metal detector and verify package seal, count, date and lot coding.","PHOTO",2),
  t("cookie-close","Delight Cookies — Lot Closeout","Food Manufacturing","Reconcile finished cases, scrap, labels, samples and batch documentation.","NONE",1),
  t("boiler-pm","Boiler Preventive Maintenance","Maintenance","Inspect burner, pressure controls, safety devices, water level, leaks and combustion condition.","PHOTO",2),
  t("compressor-pm","Air Compressor Preventive Maintenance","Maintenance","Inspect oil, filters, belts, drains, temperature, vibration and operating pressure.","RANDOM",1),
  t("breakdown-triage","Breakdown Maintenance — Safe Triage","Maintenance","Isolate equipment, capture fault condition, assess risk and document initial diagnosis.","PHOTO",1),
  t("breakdown-close","Breakdown Maintenance — Repair Closeout","Maintenance","Record repair, replaced parts, test run, root-cause notes and return-to-service approval.","PHOTO",2),
  t("meeting-room","Meeting Room Readiness","Corporate Office","Reset room, test display/AV, inspect furniture and replenish supplies.","RANDOM",1),
  t("pantry-check","Pantry Replenishment & Hygiene Check","Corporate Office","Inspect cleanliness, consumables, appliances, refrigerator and waste areas.","PHOTO",1),
  t("reception-check","Reception Opening Check","Corporate Office","Verify reception appearance, visitor supplies, signage and safety access.","NONE",0),
];

const s = (
  id:string,name:string,propertyId:string,workAreaId:string,taskIds:string[],
  cadence:string,purpose:string,frequencyType:DemoSchedule["frequencyType"]="RECURRING"
):DemoSchedule => ({id,name,propertyId,workAreaId,taskIds,cadence,purpose,frequencyType,status:"ACTIVE",timezone:"America/Denver"});

export const demoSchedules: DemoSchedule[] = [
  s("hotel-room-turn","Daily Guest Room Readiness — Floor 4","grand-vista-hotel","hotel-rooms-floor-4",["guest-room-readiness"],"Daily, 10:00 AM","Room-readiness verification before peak check-in."),
  s("hotel-lobby-open","Lobby Opening Readiness","grand-vista-hotel","hotel-lobby",["lobby-opening"],"Daily, 6:00 AM","Front-of-house readiness before morning guest traffic."),
  s("hotel-kitchen-close","Kitchen Closing Controls","grand-vista-hotel","hotel-kitchen",["kitchen-closing"],"Daily, 11:00 PM","Sanitation and close-down verification."),
  s("lot-butter-chicken","Butter Chicken Bowl — Lot Production","freshbite-foods","line-1-bowls",["bc-preop","bc-material","bc-cook","bc-fill","bc-metal","bc-close"],"Per production lot","End-to-end lot production control from line release through lot closeout.","ONE_TIME"),
  s("lot-delight-cookies","Delight Cookies — Lot Production","freshbite-foods","line-2-cookies",["cookie-preop","cookie-weigh","cookie-mix","cookie-bake","cookie-pack","cookie-close"],"Per production lot","End-to-end bakery lot control with allergen, process and packaging checks.","ONE_TIME"),
  s("boiler-pm-weekly","Boiler PM — Weekly","industrial-maintenance","maint-boiler",["boiler-pm"],"Weekly, Monday 7:00 AM","Preventive inspection before production week."),
  s("compressor-pm-monthly","Air Compressor PM — Monthly","industrial-maintenance","maint-compressor",["compressor-pm"],"Monthly, first Tuesday","Condition-based preventive maintenance."),
  s("packaging-breakdown","Packaging Machine Breakdown Response","industrial-maintenance","maint-packaging",["breakdown-triage","breakdown-close"],"Event-driven template","Safe, auditable response to unplanned equipment breakdown.","ONE_TIME"),
  s("hq-meeting-readiness","Meeting Room Morning Readiness","corporate-hq","hq-meeting",["meeting-room"],"Weekdays, 7:30 AM","Prepare shared meeting spaces before office hours."),
  s("hq-pantry","Pantry Midday Check","corporate-hq","hq-pantry",["pantry-check"],"Weekdays, 11:30 AM","Maintain hygiene and replenishment through peak use."),
];

export const demoTeam: DemoTeamMember[] = [
  { id: "maya-admin", name: "Maya Patel", role: "ADMIN", title: "Director of Operations", assignedPropertyIds: demoProperties.map((p) => p.id) },
  { id: "liam-hotel", name: "Liam Brooks", role: "PROPERTY_MANAGER", title: "Hotel Operations Manager", assignedPropertyIds: ["grand-vista-hotel"] },
  { id: "sofia-food", name: "Sofia Martinez", role: "PROPERTY_MANAGER", title: "Food Plant Operations Manager", assignedPropertyIds: ["freshbite-foods"] },
  { id: "ethan-maint", name: "Ethan Reed", role: "PROPERTY_MANAGER", title: "Maintenance Manager", assignedPropertyIds: ["industrial-maintenance"] },
  { id: "ava-office", name: "Ava Chen", role: "PROPERTY_MANAGER", title: "Facilities Manager", assignedPropertyIds: ["corporate-hq"] },
  { id: "noah-tech", name: "Noah Williams", role: "USER", title: "Maintenance Technician", assignedPropertyIds: ["industrial-maintenance"] },
  { id: "emma-qa", name: "Emma Davis", role: "USER", title: "Quality Technician", assignedPropertyIds: ["freshbite-foods"] },
  { id: "olivia-hk", name: "Olivia Brown", role: "USER", title: "Housekeeping Supervisor", assignedPropertyIds: ["grand-vista-hotel"] },
];

function hashText(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function demoDayKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEMO_WORKSPACE.timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

const statusPattern: DemoEventStatus[] = [
  "COMPLETED_ON_TIME","COMPLETED_LATE","COMPLETED_ON_TIME","IN_PROGRESS","UPCOMING",
  "MISSED","INCOMPLETE","COMPLETED_ON_TIME","COMPLETED_LATE","UPCOMING",
];

export type DemoOperationalEvent = {
  id: string;
  dateKey: string;
  scheduleId: string;
  scheduleName: string;
  propertyId: string;
  propertyName: string;
  workAreaId: string;
  workAreaName: string;
  status: DemoEventStatus;
  plannedMinutes: number;
  actualMinutes: number | null;
  delayMinutes: number;
  assignee: string;
  exception: string | null;
};

export function getDemoEventsForDate(date: Date): DemoOperationalEvent[] {
  const dateKey = demoDayKey(date);
  return demoSchedules.map((schedule, index) => {
    const seed = hashText(`${dateKey}:${schedule.id}`);
    const shifted = statusPattern[(index + (seed % statusPattern.length)) % statusPattern.length];
    const property = demoProperties.find((p) => p.id === schedule.propertyId)!;
    const workArea = property.workAreas.find((w) => w.id === schedule.workAreaId)!;
    const candidates = demoTeam.filter((m) => m.assignedPropertyIds.includes(schedule.propertyId));
    const assignee = candidates[seed % Math.max(1, candidates.length)]?.name ?? "Demo Operator";
    const plannedMinutes = getDemoScheduleTotalMinutes(schedule.id);
    let actualMinutes: number | null = plannedMinutes;
    let delayMinutes = 0;
    let exception: string | null = null;

    if (shifted === "COMPLETED_LATE") {
      delayMinutes = 12 + (seed % 37);
      actualMinutes = plannedMinutes + 8 + (seed % 25);
      exception = `Completed ${delayMinutes} minutes late`;
    } else if (shifted === "MISSED") {
      actualMinutes = null;
      delayMinutes = 45 + (seed % 75);
      exception = "Schedule missed — supervisor follow-up required";
    } else if (shifted === "INCOMPLETE") {
      actualMinutes = Math.max(10, plannedMinutes - 12);
      exception = "One or more required Tasks incomplete";
    } else if (shifted === "IN_PROGRESS") {
      actualMinutes = null;
      delayMinutes = seed % 18;
      exception = delayMinutes > 8 ? `Started ${delayMinutes} minutes late` : null;
    } else if (shifted === "UPCOMING") {
      actualMinutes = null;
    }

    if (schedule.id === "lot-butter-chicken" && seed % 3 === 0) {
      exception = "QC hold: cook temperature verification required before release";
    }
    if (schedule.id === "packaging-breakdown" && seed % 2 === 0) {
      exception = "Unplanned stoppage: sealer sensor fault under repair";
    }

    return {
      id: `${dateKey}:${schedule.id}`, dateKey, scheduleId: schedule.id, scheduleName: schedule.name,
      propertyId: property.id, propertyName: property.name, workAreaId: workArea.id, workAreaName: workArea.name,
      status: shifted, plannedMinutes, actualMinutes, delayMinutes, assignee, exception,
    };
  });
}

export function getDemoDashboard(date = new Date(), role: DemoRole = "ADMIN") {
  let events = getDemoEventsForDate(date);
  if (role === "PROPERTY_MANAGER") events = events.filter((e) => e.propertyId === "freshbite-foods");
  if (role === "USER") events = events.filter((e) => e.propertyId === "freshbite-foods");
  const counts = {
    total: events.length,
    completed: events.filter((e) => e.status === "COMPLETED_ON_TIME" || e.status === "COMPLETED_LATE").length,
    onTime: events.filter((e) => e.status === "COMPLETED_ON_TIME").length,
    late: events.filter((e) => e.status === "COMPLETED_LATE").length,
    inProgress: events.filter((e) => e.status === "IN_PROGRESS").length,
    upcoming: events.filter((e) => e.status === "UPCOMING").length,
    missed: events.filter((e) => e.status === "MISSED").length,
    incomplete: events.filter((e) => e.status === "INCOMPLETE").length,
  };
  return { dateKey: demoDayKey(date), events, counts, exceptions: events.filter((e) => e.exception) };
}

export function getDemoReport(days = 30, anchor = new Date(), role: DemoRole = "ADMIN") {
  const daily: Array<{dateKey:string;total:number;completed:number;onTime:number;late:number;missed:number;incomplete:number}> = [];
  const aggregate = { total: 0, completed: 0, onTime: 0, late: 0, missed: 0, incomplete: 0 };
  const exceptions: DemoOperationalEvent[] = [];
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(anchor.getTime() - offset * 86400000);
    let events = getDemoEventsForDate(d);
    if (role !== "ADMIN") events = events.filter((e) => e.propertyId === "freshbite-foods");
    const row = {
      dateKey: demoDayKey(d), total: events.length,
      completed: events.filter((e) => e.status === "COMPLETED_ON_TIME" || e.status === "COMPLETED_LATE").length,
      onTime: events.filter((e) => e.status === "COMPLETED_ON_TIME").length,
      late: events.filter((e) => e.status === "COMPLETED_LATE").length,
      missed: events.filter((e) => e.status === "MISSED").length,
      incomplete: events.filter((e) => e.status === "INCOMPLETE").length,
    };
    daily.push(row);
    Object.keys(aggregate).forEach((key) => { aggregate[key as keyof typeof aggregate] += row[key as keyof typeof row] as number; });
    exceptions.push(...events.filter((e) => e.exception));
  }
  const performancePct = aggregate.total ? Math.round((aggregate.completed / aggregate.total) * 1000) / 10 : 0;
  const onTimePct = aggregate.completed ? Math.round((aggregate.onTime / aggregate.completed) * 1000) / 10 : 0;
  return { days, daily, aggregate, performancePct, onTimePct, exceptions: exceptions.slice(-20).reverse() };
}

export function findDemoTask(id: string) {
  return demoTasks.find((task) => task.id === id) ?? null;
}

export function findDemoProperty(id: string) {
  return demoProperties.find((property) => property.id === id) ?? null;
}

export function findDemoSchedule(id: string) {
  return demoSchedules.find((schedule) => schedule.id === id) ?? null;
}

export function findDemoWorkArea(id: string) {
  for (const property of demoProperties) {
    const workArea = property.workAreas.find((w) => w.id === id);
    if (workArea) return { property, workArea };
  }
  return null;
}

export function visibleDemoProperties(role: DemoRole) {
  return role === "ADMIN" ? demoProperties : demoProperties.filter((p) => p.id === "freshbite-foods");
}

export function visibleDemoSchedules(role: DemoRole) {
  const ids = new Set(visibleDemoProperties(role).map((p) => p.id));
  return demoSchedules.filter((schedule) => ids.has(schedule.propertyId));
}

export function visibleDemoTasks(role: DemoRole) {
  if (role === "ADMIN") return demoTasks;
  const scheduleTaskIds = new Set(visibleDemoSchedules(role).flatMap((s) => s.taskIds));
  return demoTasks.filter((task) => scheduleTaskIds.has(task.id));
}

export function getDemoTaskDurationMinutes(taskId: string) {
  const fixed: Record<string, number> = {
    "bc-preop": 20, "bc-material": 15, "bc-cook": 55, "bc-fill": 35, "bc-metal": 20, "bc-close": 15,
    "cookie-preop": 20, "cookie-weigh": 25, "cookie-mix": 20, "cookie-bake": 45, "cookie-pack": 30, "cookie-close": 15,
    "breakdown-triage": 30, "breakdown-close": 45, "boiler-pm": 60, "compressor-pm": 50,
  };
  return fixed[taskId] ?? 30;
}

export function getDemoScheduleTotalMinutes(scheduleId: string) {
  const schedule = findDemoSchedule(scheduleId);
  if (!schedule) return 0;
  return schedule.taskIds.reduce((sum, id) => sum + getDemoTaskDurationMinutes(id), 0);
}

export function minutesToDemoDuration(minutes: number) {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function getDemoScheduleRows(scheduleId: string) {
  const schedule = findDemoSchedule(scheduleId);
  if (!schedule) return [];
  let offset = 0;
  return schedule.taskIds.map((taskId, index) => {
    const task = findDemoTask(taskId)!;
    const durationMinutes = getDemoTaskDurationMinutes(taskId);
    const row = {
      sequence: index + 1,
      task,
      durationMinutes,
      startOffsetMinutes: offset,
      endOffsetMinutes: offset + durationMinutes,
    };
    offset += durationMinutes;
    return row;
  });
}

export function getDemoScheduleOccurrences(scheduleId: string, anchor = new Date()) {
  const rows = [];
  for (let offset = -1; offset <= 4; offset++) {
    const d = new Date(anchor.getTime() + offset * 86400000);
    const event = getDemoEventsForDate(d).find((e) => e.scheduleId === scheduleId);
    if (event) rows.push(event);
  }
  return rows;
}

export function demoTaskUsageCount(taskId: string) {
  return demoSchedules.filter((s) => s.taskIds.includes(taskId)).length;
}
