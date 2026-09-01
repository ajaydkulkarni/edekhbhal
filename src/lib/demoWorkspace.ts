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
};

export type DemoWorkArea = {
  id: string;
  propertyId: string;
  name: string;
  description: string;
};

export type DemoProperty = {
  id: string;
  name: string;
  industry: string;
  description: string;
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

export const demoProperties: DemoProperty[] = [
  {
    id: "grand-vista-hotel",
    name: "Grand Vista Hotel",
    industry: "Hospitality",
    description: "Guest-room, public-area, kitchen and safety operations.",
    workAreas: [
      { id: "hotel-lobby", propertyId: "grand-vista-hotel", name: "Main Lobby", description: "Guest-facing lobby and reception zone." },
      { id: "hotel-rooms-floor-4", propertyId: "grand-vista-hotel", name: "Guest Rooms — Floor 4", description: "Guest room housekeeping and room-readiness checks." },
      { id: "hotel-kitchen", propertyId: "grand-vista-hotel", name: "Main Kitchen", description: "Food preparation, sanitation and closing controls." },
      { id: "hotel-pool", propertyId: "grand-vista-hotel", name: "Pool & Fitness", description: "Guest amenity inspection and sanitation." },
    ],
  },
  {
    id: "freshbite-foods",
    name: "FreshBite Foods Manufacturing Plant",
    industry: "Food Manufacturing",
    description: "Lot-controlled production, sanitation, quality and packaging operations.",
    workAreas: [
      { id: "line-1-bowls", propertyId: "freshbite-foods", name: "Line 1 — Prepared Meals", description: "Butter Chicken Bowl production line." },
      { id: "line-2-cookies", propertyId: "freshbite-foods", name: "Line 2 — Bakery", description: "Delight Cookies production line." },
      { id: "food-qc-lab", propertyId: "freshbite-foods", name: "Quality Lab", description: "In-process and finished-goods quality verification." },
      { id: "food-sanitation", propertyId: "freshbite-foods", name: "Sanitation Zone", description: "Pre-op and post-op sanitation controls." },
    ],
  },
  {
    id: "industrial-maintenance",
    name: "Industrial Maintenance Facility",
    industry: "Maintenance",
    description: "Preventive maintenance, inspections and breakdown-response practices.",
    workAreas: [
      { id: "maint-boiler", propertyId: "industrial-maintenance", name: "Boiler Room", description: "Boilers, pumps and steam-system assets." },
      { id: "maint-compressor", propertyId: "industrial-maintenance", name: "Compressor Bay", description: "Compressed-air system and dryers." },
      { id: "maint-packaging", propertyId: "industrial-maintenance", name: "Packaging Machine Cell", description: "Conveyors, sealers, motors and sensors." },
    ],
  },
  {
    id: "corporate-hq",
    name: "Corporate Headquarters",
    industry: "Corporate Office",
    description: "Facilities, meeting-room, pantry and workplace readiness routines.",
    workAreas: [
      { id: "hq-reception", propertyId: "corporate-hq", name: "Reception & Visitor Area", description: "Front-of-house readiness and safety." },
      { id: "hq-meeting", propertyId: "corporate-hq", name: "Meeting Rooms", description: "Room reset, AV and consumables." },
      { id: "hq-pantry", propertyId: "corporate-hq", name: "Pantry & Break Area", description: "Cleanliness, replenishment and equipment checks." },
    ],
  },
];

export const demoTasks: DemoTask[] = [
  { id: "guest-room-readiness", name: "Guest Room Readiness Inspection", category: "Hospitality", description: "Verify linen, amenities, cleanliness, minibar, bathroom and maintenance exceptions before room release.", evidence: "RANDOM" },
  { id: "lobby-opening", name: "Lobby Opening Readiness", category: "Hospitality", description: "Inspect floors, glass, furniture, lighting, scent, signage and guest-facing supplies.", evidence: "PHOTO" },
  { id: "kitchen-closing", name: "Kitchen Closing Sanitation", category: "Hospitality", description: "Complete food-contact sanitation, waste removal, temperature checks and close-down verification.", evidence: "PHOTO" },
  { id: "pool-safety", name: "Pool & Fitness Safety Inspection", category: "Hospitality", description: "Inspect water-area safety, equipment condition, towels, sanitation and signage.", evidence: "PHOTO" },

  { id: "bc-preop", name: "Butter Chicken Bowl — Pre-Op Sanitation & Line Clearance", category: "Food Manufacturing", description: "Verify pre-operation sanitation release, allergen clearance, prior-lot material removal and line readiness.", evidence: "PHOTO" },
  { id: "bc-material", name: "Butter Chicken Bowl — Material & Lot Verification", category: "Food Manufacturing", description: "Verify approved ingredients, lot codes, expiry status and staged quantities against batch requirements.", evidence: "NONE" },
  { id: "bc-cook", name: "Butter Chicken Bowl — Cooking & Critical Temperature Check", category: "Food Manufacturing", description: "Control cook sequence and verify critical product temperature before filling.", evidence: "PHOTO" },
  { id: "bc-fill", name: "Butter Chicken Bowl — Fill, Seal & Weight Verification", category: "Food Manufacturing", description: "Verify component fill weights, seal integrity and check-weight conformance.", evidence: "RANDOM" },
  { id: "bc-metal", name: "Butter Chicken Bowl — Metal Detection & Label Verification", category: "Food Manufacturing", description: "Complete detector challenge checks and verify product, allergen, lot and date coding.", evidence: "PHOTO" },
  { id: "bc-close", name: "Butter Chicken Bowl — Lot Closeout", category: "Food Manufacturing", description: "Reconcile output, scrap, retained samples, labels and lot documentation.", evidence: "NONE" },

  { id: "cookie-preop", name: "Delight Cookies — Pre-Op Sanitation & Allergen Clearance", category: "Food Manufacturing", description: "Confirm bakery line release, allergen changeover, utensils and contact surfaces.", evidence: "PHOTO" },
  { id: "cookie-weigh", name: "Delight Cookies — Ingredient Weighing & Verification", category: "Food Manufacturing", description: "Verify ingredient identity, lot numbers and weighed quantities before mixing.", evidence: "NONE" },
  { id: "cookie-mix", name: "Delight Cookies — Mixing & Dough Check", category: "Food Manufacturing", description: "Control mixing parameters and verify dough appearance and temperature.", evidence: "RANDOM" },
  { id: "cookie-bake", name: "Delight Cookies — Bake Profile & Quality Check", category: "Food Manufacturing", description: "Verify oven settings, bake time, color, dimensions and finished product condition.", evidence: "PHOTO" },
  { id: "cookie-pack", name: "Delight Cookies — Metal Detection, Packaging & Coding", category: "Food Manufacturing", description: "Challenge metal detector and verify package seal, count, date and lot coding.", evidence: "PHOTO" },
  { id: "cookie-close", name: "Delight Cookies — Lot Closeout", category: "Food Manufacturing", description: "Reconcile finished cases, scrap, labels, samples and batch documentation.", evidence: "NONE" },

  { id: "boiler-pm", name: "Boiler Preventive Maintenance", category: "Maintenance", description: "Inspect burner, pressure controls, safety devices, water level, leaks and combustion condition.", evidence: "PHOTO" },
  { id: "compressor-pm", name: "Air Compressor Preventive Maintenance", category: "Maintenance", description: "Inspect oil, filters, belts, drains, temperature, vibration and operating pressure.", evidence: "RANDOM" },
  { id: "breakdown-triage", name: "Breakdown Maintenance — Safe Triage", category: "Maintenance", description: "Isolate equipment, capture fault condition, assess risk and document initial diagnosis.", evidence: "PHOTO" },
  { id: "breakdown-close", name: "Breakdown Maintenance — Repair Closeout", category: "Maintenance", description: "Record repair, replaced parts, test run, root-cause notes and return-to-service approval.", evidence: "PHOTO" },

  { id: "meeting-room", name: "Meeting Room Readiness", category: "Corporate Office", description: "Reset room, test display/AV, inspect furniture and replenish supplies.", evidence: "RANDOM" },
  { id: "pantry-check", name: "Pantry Replenishment & Hygiene Check", category: "Corporate Office", description: "Inspect cleanliness, consumables, appliances, refrigerator and waste areas.", evidence: "PHOTO" },
  { id: "reception-check", name: "Reception Opening Check", category: "Corporate Office", description: "Verify reception appearance, visitor supplies, signage and safety access.", evidence: "NONE" },
];

export const demoSchedules: DemoSchedule[] = [
  { id: "hotel-room-turn", name: "Daily Guest Room Readiness — Floor 4", propertyId: "grand-vista-hotel", workAreaId: "hotel-rooms-floor-4", taskIds: ["guest-room-readiness"], cadence: "Daily, 10:00 AM", purpose: "Room-readiness verification before peak check-in." },
  { id: "hotel-lobby-open", name: "Lobby Opening Readiness", propertyId: "grand-vista-hotel", workAreaId: "hotel-lobby", taskIds: ["lobby-opening"], cadence: "Daily, 6:00 AM", purpose: "Front-of-house readiness before morning guest traffic." },
  { id: "hotel-kitchen-close", name: "Kitchen Closing Controls", propertyId: "grand-vista-hotel", workAreaId: "hotel-kitchen", taskIds: ["kitchen-closing"], cadence: "Daily, 11:00 PM", purpose: "Sanitation and close-down verification." },

  { id: "lot-butter-chicken", name: "Butter Chicken Bowl — Lot Production", propertyId: "freshbite-foods", workAreaId: "line-1-bowls", taskIds: ["bc-preop","bc-material","bc-cook","bc-fill","bc-metal","bc-close"], cadence: "Per production lot", purpose: "End-to-end lot production control from line release through lot closeout." },
  { id: "lot-delight-cookies", name: "Delight Cookies — Lot Production", propertyId: "freshbite-foods", workAreaId: "line-2-cookies", taskIds: ["cookie-preop","cookie-weigh","cookie-mix","cookie-bake","cookie-pack","cookie-close"], cadence: "Per production lot", purpose: "End-to-end bakery lot control with allergen, process and packaging checks." },

  { id: "boiler-pm-weekly", name: "Boiler PM — Weekly", propertyId: "industrial-maintenance", workAreaId: "maint-boiler", taskIds: ["boiler-pm"], cadence: "Weekly, Monday 7:00 AM", purpose: "Preventive inspection before production week." },
  { id: "compressor-pm-monthly", name: "Air Compressor PM — Monthly", propertyId: "industrial-maintenance", workAreaId: "maint-compressor", taskIds: ["compressor-pm"], cadence: "Monthly, first Tuesday", purpose: "Condition-based preventive maintenance." },
  { id: "packaging-breakdown", name: "Packaging Machine Breakdown Response", propertyId: "industrial-maintenance", workAreaId: "maint-packaging", taskIds: ["breakdown-triage","breakdown-close"], cadence: "Event-driven template", purpose: "Safe, auditable response to unplanned equipment breakdown." },

  { id: "hq-meeting-readiness", name: "Meeting Room Morning Readiness", propertyId: "corporate-hq", workAreaId: "hq-meeting", taskIds: ["meeting-room"], cadence: "Weekdays, 7:30 AM", purpose: "Prepare shared meeting spaces before office hours." },
  { id: "hq-pantry", name: "Pantry Midday Check", propertyId: "corporate-hq", workAreaId: "hq-pantry", taskIds: ["pantry-check"], cadence: "Weekdays, 11:30 AM", purpose: "Maintain hygiene and replenishment through peak use." },
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
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const statusPattern: DemoEventStatus[] = [
  "COMPLETED_ON_TIME",
  "COMPLETED_LATE",
  "COMPLETED_ON_TIME",
  "IN_PROGRESS",
  "UPCOMING",
  "MISSED",
  "INCOMPLETE",
  "COMPLETED_ON_TIME",
  "COMPLETED_LATE",
  "UPCOMING",
];

export type DemoOperationalEvent = {
  id: string;
  dateKey: string;
  scheduleId: string;
  scheduleName: string;
  propertyId: string;
  propertyName: string;
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
    const plannedMinutes = 30 + (seed % 7) * 10;
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
      id: `${dateKey}:${schedule.id}`,
      dateKey,
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      propertyId: property.id,
      propertyName: property.name,
      workAreaName: workArea.name,
      status: shifted,
      plannedMinutes,
      actualMinutes,
      delayMinutes,
      assignee,
      exception,
    };
  });
}

export function getDemoDashboard(date = new Date()) {
  const events = getDemoEventsForDate(date);
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
  return {
    dateKey: demoDayKey(date),
    events,
    counts,
    exceptions: events.filter((e) => e.exception),
  };
}

export function getDemoReport(days = 30, anchor = new Date()) {
  const daily: Array<{
    dateKey: string;
    total: number;
    completed: number;
    onTime: number;
    late: number;
    missed: number;
    incomplete: number;
  }> = [];
  const aggregate = { total: 0, completed: 0, onTime: 0, late: 0, missed: 0, incomplete: 0 };
  const exceptions: DemoOperationalEvent[] = [];

  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(anchor.getTime() - offset * 86400000);
    const events = getDemoEventsForDate(d);
    const row = {
      dateKey: demoDayKey(d),
      total: events.length,
      completed: events.filter((e) => e.status === "COMPLETED_ON_TIME" || e.status === "COMPLETED_LATE").length,
      onTime: events.filter((e) => e.status === "COMPLETED_ON_TIME").length,
      late: events.filter((e) => e.status === "COMPLETED_LATE").length,
      missed: events.filter((e) => e.status === "MISSED").length,
      incomplete: events.filter((e) => e.status === "INCOMPLETE").length,
    };
    daily.push(row);
    aggregate.total += row.total;
    aggregate.completed += row.completed;
    aggregate.onTime += row.onTime;
    aggregate.late += row.late;
    aggregate.missed += row.missed;
    aggregate.incomplete += row.incomplete;
    exceptions.push(...events.filter((e) => e.exception));
  }

  const performancePct = aggregate.total ? Math.round((aggregate.completed / aggregate.total) * 1000) / 10 : 0;
  const onTimePct = aggregate.completed ? Math.round((aggregate.onTime / aggregate.completed) * 1000) / 10 : 0;

  return {
    days,
    daily,
    aggregate,
    performancePct,
    onTimePct,
    exceptions: exceptions.slice(-20).reverse(),
  };
}

export function findDemoTask(id: string) {
  return demoTasks.find((task) => task.id === id) ?? null;
}

export function findDemoWorkArea(id: string) {
  for (const property of demoProperties) {
    const workArea = property.workAreas.find((w) => w.id === id);
    if (workArea) return { property, workArea };
  }
  return null;
}
