import {
  ActionType,
  EvidenceRule,
  MembershipRole,
  Prisma,
  RandomEvidenceType,
  ScheduleFrequencyType,
  ScheduleRecurrenceUnit,
  Status,
  SubscriptionStatus
} from "@prisma/client";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { buildOffsets, zonedLocalToUtc } from "@/lib/schedule";
import { reconcileScheduleOccurrences } from "@/lib/occurrenceGenerator";

export const DEMO_ORG_ID = process.env.DEMO_ORG_ID ?? "seed_demo_org_edekhbhal";
export const DEMO_ORG_NAME = process.env.DEMO_ORG_NAME ?? "eDekhbhal Demo Operations";
export const DEMO_TIMEZONE = process.env.DEMO_TIMEZONE ?? "America/Denver";

export const DEMO_LOGIN_EMAILS = [
  "demo.admin@edekhbhal.test",
  "demo.pm1@edekhbhal.test",
  "demo.pm2@edekhbhal.test",
  "demo.supervisor@edekhbhal.test",
  "demo.worker1@edekhbhal.test",
  "demo.worker2@edekhbhal.test"
] as const;

type WorkingHours = {
  days: Record<string, Array<{ start: string; end: string }>>;
};

const organizationHours: WorkingHours = {
  days: {
    "0": [{ start: "08:00", end: "14:00" }],
    "1": [{ start: "06:00", end: "22:00" }],
    "2": [{ start: "06:00", end: "22:00" }],
    "3": [{ start: "06:00", end: "22:00" }],
    "4": [{ start: "06:00", end: "22:00" }],
    "5": [{ start: "06:00", end: "22:00" }],
    "6": [{ start: "07:00", end: "18:00" }]
  }
};

const medical24x7Hours: WorkingHours = {
  days: Object.fromEntries(
    Array.from({ length: 7 }, (_, day) => [
      String(day),
      [{ start: "00:00", end: "23:59" }]
    ])
  )
};

const warehouseHours: WorkingHours = {
  days: {
    "0": [],
    "1": [{ start: "05:00", end: "23:00" }],
    "2": [{ start: "05:00", end: "23:00" }],
    "3": [{ start: "05:00", end: "23:00" }],
    "4": [{ start: "05:00", end: "23:00" }],
    "5": [{ start: "05:00", end: "23:00" }],
    "6": [{ start: "06:00", end: "20:00" }]
  }
};

const conferenceHours: WorkingHours = {
  days: {
    "0": [],
    "1": [{ start: "07:00", end: "20:00" }],
    "2": [{ start: "07:00", end: "20:00" }],
    "3": [{ start: "07:00", end: "20:00" }],
    "4": [{ start: "07:00", end: "20:00" }],
    "5": [{ start: "07:00", end: "20:00" }],
    "6": []
  }
};

const treatmentCorridorHours: WorkingHours = {
  days: Object.fromEntries(
    Array.from({ length: 7 }, (_, day) => [
      String(day),
      [{ start: "06:00", end: "23:00" }]
    ])
  )
};

const shippingDockHours: WorkingHours = {
  days: {
    "0": [],
    "1": [{ start: "06:00", end: "22:00" }],
    "2": [{ start: "06:00", end: "22:00" }],
    "3": [{ start: "06:00", end: "22:00" }],
    "4": [{ start: "06:00", end: "22:00" }],
    "5": [{ start: "06:00", end: "22:00" }],
    "6": [{ start: "06:00", end: "18:00" }]
  }
};

function ymdInZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addLocalDays(baseYmd: string, days: number) {
  const [year, month, day] = baseYmd.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function dateOnly(ymd: string) {
  return new Date(`${ymd}T00:00:00.000Z`);
}

function startAt(ymd: string, hhmm: string) {
  return zonedLocalToUtc(`${ymd}T${hhmm}`, DEMO_TIMEZONE);
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function auditOnce(input: {
  key: string;
  organizationId?: string | null;
  userId?: string | null;
  action: ActionType;
  entityType: string;
  entityId: string;
  newValue?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}) {
  const requestId = `demo-seed:v1:${input.key}`;
  const exists = await prisma.auditLog.findFirst({ where: { requestId }, select: { id: true } });
  if (exists) return;
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      newValue: input.newValue,
      metadata: {
        source: "prisma/seed-demo.ts",
        demoSeed: true,
        ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : {})
      } as Prisma.InputJsonValue,
      requestId
    }
  });
}

async function seedPlans() {
  const plans = [
    { code: "STARTER", name: "Starter", maxUsers: 5, maxProperties: 1, maxWorkAreas: 25, monthlyPriceCents: 0 },
    { code: "PROFESSIONAL", name: "Professional", maxUsers: 50, maxProperties: 10, maxWorkAreas: 500, monthlyPriceCents: 4900 },
    { code: "ENTERPRISE", name: "Enterprise", maxUsers: null, maxProperties: null, maxWorkAreas: null, monthlyPriceCents: 0 }
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan
    });
  }
}

async function seedUsersAndOrganization() {
  const users = [
    { email: "demo.admin@edekhbhal.test", name: "Demo Admin", role: MembershipRole.ADMIN },
    { email: "demo.pm1@edekhbhal.test", name: "Priya Shah — Property Manager", role: MembershipRole.PROPERTY_MANAGER },
    { email: "demo.pm2@edekhbhal.test", name: "Michael Reed — Property Manager", role: MembershipRole.PROPERTY_MANAGER },
    { email: "demo.supervisor@edekhbhal.test", name: "Demo Supervisor", role: MembershipRole.USER },
    { email: "demo.worker1@edekhbhal.test", name: "Jordan Lee — Worker", role: MembershipRole.USER },
    { email: "demo.worker2@edekhbhal.test", name: "Taylor Morgan — Worker", role: MembershipRole.USER }
  ];

  const savedUsers = [];
  for (const row of users) {
    const user = await prisma.user.upsert({
      where: { email: row.email },
      update: {
        name: row.name,
        active: true,
        emailVerified: new Date()
      },
      create: {
        email: row.email,
        name: row.name,
        active: true,
        emailVerified: new Date()
      }
    });
    savedUsers.push({ ...row, user });
  }

  const admin = savedUsers[0].user;

  const organization = await prisma.organization.upsert({
    where: { id: DEMO_ORG_ID },
    update: {
      name: DEMO_ORG_NAME,
      addressLine1: "250 South Main Street",
      addressLine2: "Suite 800",
      addressLine3: null,
      city: "Salt Lake City",
      state: "Utah",
      postalCode: "84101",
      country: "USA",
      timezone: DEMO_TIMEZONE,
      workingHours: organizationHours as any
    },
    create: {
      id: DEMO_ORG_ID,
      name: DEMO_ORG_NAME,
      addressLine1: "250 South Main Street",
      addressLine2: "Suite 800",
      city: "Salt Lake City",
      state: "Utah",
      postalCode: "84101",
      country: "USA",
      timezone: DEMO_TIMEZONE,
      workingHours: organizationHours as any
    }
  });

  for (const row of savedUsers) {
    const member = await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: row.user.id
        }
      },
      update: {
        role: row.role,
        status: Status.ACTIVE
      },
      create: {
        organizationId: organization.id,
        userId: row.user.id,
        role: row.role,
        status: Status.ACTIVE
      }
    });

    await auditOnce({
      key: `member:${row.email}`,
      organizationId: organization.id,
      userId: admin.id,
      action: ActionType.USER_INVITED,
      entityType: "OrganizationMember",
      entityId: member.id,
      newValue: {
        email: row.email,
        name: row.name,
        role: row.role,
        status: Status.ACTIVE
      }
    });
  }

  await auditOnce({
    key: "organization",
    organizationId: organization.id,
    userId: admin.id,
    action: ActionType.ORGANIZATION_CREATED,
    entityType: "Organization",
    entityId: organization.id,
    newValue: {
      name: organization.name,
      city: organization.city,
      state: organization.state,
      timezone: organization.timezone
    }
  });

  const professional = await prisma.plan.findUniqueOrThrow({ where: { code: "PROFESSIONAL" } });
  const subscription = await prisma.subscription.upsert({
    where: { organizationId: organization.id },
    update: {
      planId: professional.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    },
    create: {
      organizationId: organization.id,
      planId: professional.id,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    }
  });

  await auditOnce({
    key: "subscription",
    organizationId: organization.id,
    userId: admin.id,
    action: ActionType.SUBSCRIPTION_CREATED,
    entityType: "Subscription",
    entityId: subscription.id,
    newValue: {
      plan: "PROFESSIONAL",
      status: SubscriptionStatus.ACTIVE
    }
  });

  return { organization, admin, users: savedUsers };
}

async function seedProperties(organizationId: string, adminId: string) {
  const definitions = [
    {
      id: "seed_property_hq",
      name: "Downtown Corporate Center",
      addressLine1: "250 South Main Street",
      addressLine2: "Suite 800",
      city: "Salt Lake City",
      state: "Utah",
      postalCode: "84101",
      country: "USA",
      timezone: DEMO_TIMEZONE,
      workingHours: null as WorkingHours | null
    },
    {
      id: "seed_property_medical",
      name: "Riverside Medical Plaza",
      addressLine1: "1450 East Riverside Drive",
      addressLine2: null,
      city: "Murray",
      state: "Utah",
      postalCode: "84107",
      country: "USA",
      timezone: DEMO_TIMEZONE,
      workingHours: medical24x7Hours
    },
    {
      id: "seed_property_warehouse",
      name: "North Distribution Center",
      addressLine1: "7800 West Logistics Way",
      addressLine2: null,
      city: "Salt Lake City",
      state: "Utah",
      postalCode: "84116",
      country: "USA",
      timezone: DEMO_TIMEZONE,
      workingHours: warehouseHours
    }
  ];

  const result: Record<string, Awaited<ReturnType<typeof prisma.property.upsert>>> = {};

  for (const p of definitions) {
    const saved = await prisma.property.upsert({
      where: { id: p.id },
      update: {
        organizationId,
        name: p.name,
        addressLine1: p.addressLine1,
        addressLine2: p.addressLine2,
        city: p.city,
        state: p.state,
        postalCode: p.postalCode,
        country: p.country,
        timezone: p.timezone,
        workingHours: p.workingHours === null ? Prisma.DbNull : p.workingHours as any,
        status: Status.ACTIVE
      },
      create: {
        id: p.id,
        organizationId,
        name: p.name,
        addressLine1: p.addressLine1,
        addressLine2: p.addressLine2,
        city: p.city,
        state: p.state,
        postalCode: p.postalCode,
        country: p.country,
        timezone: p.timezone,
        workingHours: p.workingHours === null ? Prisma.DbNull : p.workingHours as any,
        status: Status.ACTIVE
      }
    });
    result[p.id] = saved;

    await auditOnce({
      key: `property:${p.id}`,
      organizationId,
      userId: adminId,
      action: ActionType.PROPERTY_CREATED,
      entityType: "Property",
      entityId: saved.id,
      newValue: {
        name: saved.name,
        city: saved.city,
        timezone: saved.timezone,
        status: saved.status,
        workingHoursMode: p.workingHours === null ? "INHERIT_ORGANIZATION" : "OVERRIDE"
      }
    });
  }

  return result;
}

async function seedWorkAreas(organizationId: string, adminId: string) {
  const definitions = [
    {
      id: "seed_wa_hq_lobby",
      propertyId: "seed_property_hq",
      name: "Main Lobby",
      description: "Primary public entrance, reception and visitor waiting area.",
      locationIdentifier: "Ground Floor — Main Entrance",
      workingHours: null as WorkingHours | null
    },
    {
      id: "seed_wa_hq_conference",
      propertyId: "seed_property_hq",
      name: "Conference Suite",
      description: "Executive conference rooms and shared meeting corridor.",
      locationIdentifier: "8th Floor — East Wing",
      workingHours: conferenceHours
    },
    {
      id: "seed_wa_hq_pantry",
      propertyId: "seed_property_hq",
      name: "Employee Pantry",
      description: "Employee pantry, coffee point and shared dining counter.",
      locationIdentifier: "8th Floor — West Wing",
      workingHours: null as WorkingHours | null
    },
    {
      id: "seed_wa_hq_restroom",
      propertyId: "seed_property_hq",
      name: "Public Restrooms — Level 1",
      description: "Public male/female/all-gender restroom area near reception.",
      locationIdentifier: "Ground Floor — North Corridor",
      workingHours: null as WorkingHours | null
    },
    {
      id: "seed_wa_med_waiting",
      propertyId: "seed_property_medical",
      name: "Reception & Waiting Area",
      description: "24x7 reception, waiting chairs and high-touch patient arrival area.",
      locationIdentifier: "Ground Floor — Main Reception",
      workingHours: null as WorkingHours | null
    },
    {
      id: "seed_wa_med_restroom",
      propertyId: "seed_property_medical",
      name: "Public Restrooms",
      description: "Patient and visitor restrooms adjoining the waiting area.",
      locationIdentifier: "Ground Floor — West Hall",
      workingHours: null as WorkingHours | null
    },
    {
      id: "seed_wa_med_corridor",
      propertyId: "seed_property_medical",
      name: "Treatment Corridor",
      description: "Clinical circulation corridor and shared touchpoints outside treatment rooms.",
      locationIdentifier: "Level 2 — Clinical Wing",
      workingHours: treatmentCorridorHours
    },
    {
      id: "seed_wa_wh_dock",
      propertyId: "seed_property_warehouse",
      name: "Shipping Dock",
      description: "Outbound loading dock, staging lanes and dock doors.",
      locationIdentifier: "Dock Doors 1–8",
      workingHours: shippingDockHours
    },
    {
      id: "seed_wa_wh_floor",
      propertyId: "seed_property_warehouse",
      name: "Main Warehouse Floor",
      description: "Primary racking aisles and material movement zone.",
      locationIdentifier: "Warehouse Aisles A–H",
      workingHours: null as WorkingHours | null
    },
    {
      id: "seed_wa_wh_safety",
      propertyId: "seed_property_warehouse",
      name: "Safety & Emergency Station",
      description: "Fire extinguishers, spill response, eyewash and emergency equipment station.",
      locationIdentifier: "North Wall — Safety Point S1",
      workingHours: null as WorkingHours | null
    }
  ];

  const result: Record<string, Awaited<ReturnType<typeof prisma.workArea.upsert>>> = {};

  for (const wa of definitions) {
    const saved = await prisma.workArea.upsert({
      where: { id: wa.id },
      update: {
        propertyId: wa.propertyId,
        name: wa.name,
        description: wa.description,
        locationIdentifier: wa.locationIdentifier,
        workingHours: wa.workingHours === null ? Prisma.DbNull : wa.workingHours as any,
        status: Status.ACTIVE
      },
      create: {
        id: wa.id,
        propertyId: wa.propertyId,
        name: wa.name,
        description: wa.description,
        locationIdentifier: wa.locationIdentifier,
        workingHours: wa.workingHours === null ? Prisma.DbNull : wa.workingHours as any,
        status: Status.ACTIVE
      }
    });
    result[wa.id] = saved;

    await auditOnce({
      key: `workarea:${wa.id}`,
      organizationId,
      userId: adminId,
      action: ActionType.WORK_AREA_CREATED,
      entityType: "WorkArea",
      entityId: saved.id,
      newValue: {
        name: saved.name,
        propertyId: saved.propertyId,
        locationIdentifier: saved.locationIdentifier,
        status: saved.status,
        workingHoursMode: wa.workingHours === null ? "INHERIT_PROPERTY" : "OVERRIDE"
      }
    });

    const qrId = `seed_qr_${wa.id}`;
    const tokenSeed = `edekhbhal-demo-qr:${wa.id}`;
    const qr = await prisma.qrCode.upsert({
      where: { id: qrId },
      update: {
        workAreaId: wa.id,
        tokenHash: sha256(tokenSeed),
        tokenPreview: `DEMO-${wa.id.slice(-8)}`,
        status: Status.ACTIVE,
        generatedById: adminId,
        revokedAt: null,
        revokedById: null
      },
      create: {
        id: qrId,
        workAreaId: wa.id,
        tokenHash: sha256(tokenSeed),
        tokenPreview: `DEMO-${wa.id.slice(-8)}`,
        status: Status.ACTIVE,
        generatedById: adminId
      }
    });

    await auditOnce({
      key: `qr:${wa.id}`,
      organizationId,
      userId: adminId,
      action: ActionType.QR_GENERATED,
      entityType: "QrCode",
      entityId: qr.id,
      newValue: {
        workAreaId: wa.id,
        status: Status.ACTIVE
      }
    });
  }

  return result;
}

const taskDefinitions = [
  {
    id: "seed_task_litter",
    name: "Inspect the area and remove all visible litter, loose paper and debris.",
    html: "<h3>Visual cleanliness check</h3><p>Walk the complete Work Area from entrance to exit. Pick up visible litter and remove debris from corners, under furniture and around doorways.</p><ul><li>Use appropriate gloves.</li><li>Separate recyclable material where bins are available.</li><li>Escalate sharp or hazardous waste instead of handling it without PPE.</li></ul>"
  },
  {
    id: "seed_task_vacuum",
    name: "Vacuum all carpeted floor surfaces including edges and high-traffic paths.",
    html: "<p>Vacuum the complete carpeted area using overlapping passes. Pay special attention to entrances, chair locations and visible traffic lanes.</p><p><strong>Finish standard:</strong> no visible crumbs, dust lines or loose fibers.</p>"
  },
  {
    id: "seed_task_mop",
    name: "Damp-mop hard floors and leave the surface clean, dry and streak-free.",
    html: "<p>Place warning signage before mopping. Remove loose soil first, then damp-mop using the approved solution.</p><ol><li>Work from the cleanest area toward the exit.</li><li>Do not leave standing water.</li><li>Remove signage only after the floor is safe.</li></ol>"
  },
  {
    id: "seed_task_touchpoints",
    name: "Disinfect high-touch points such as handles, switches, counters and shared controls.",
    html: "<p>Use the site-approved disinfectant and observe the required contact time.</p><ul><li>Door handles and push plates</li><li>Light switches</li><li>Reception counters</li><li>Shared controls and touchscreens</li></ul>"
  },
  {
    id: "seed_task_restroom_clean",
    name: "Clean and disinfect toilets, urinals, sinks, counters, mirrors and restroom fixtures.",
    html: "<p>Clean from higher surfaces to lower surfaces and from cleaner fixtures to dirtier fixtures. Use color-coded restroom tools where applicable.</p><p><strong>Never</strong> reuse restroom cloths in food or office areas.</p>"
  },
  {
    id: "seed_task_restroom_restock",
    name: "Check and replenish soap, tissue, paper towels and other restroom consumables.",
    html: "<p>Inspect every dispenser. Refill before the dispenser becomes empty and remove damaged or jammed consumables.</p><p>Record recurring stock shortages for supervisor follow-up.</p>"
  },
  {
    id: "seed_task_conference_reset",
    name: "Reset the conference room to the standard layout and leave tables and chairs presentation-ready.",
    html: "<p>Return chairs to the standard layout, align tables, remove abandoned papers and wipe visible marks.</p><ul><li>Check under the table.</li><li>Return cables/remotes to the designated position.</li><li>Report damaged furniture or AV equipment.</li></ul>"
  },
  {
    id: "seed_task_waste",
    name: "Empty waste and recycling bins, replace liners and clean visible spills on the bin.",
    html: "<p>Remove waste without over-compressing bags. Replace liners neatly and wipe the bin exterior if marked.</p><p>Follow site segregation rules for recycling and regulated waste.</p>"
  },
  {
    id: "seed_task_glass",
    name: "Clean glass doors, partitions and mirrors until fingerprints and streaks are removed.",
    html: "<p>Clean both sides where accessible. Inspect the surface from an angle under available lighting to identify streaks.</p>"
  },
  {
    id: "seed_task_dust",
    name: "Dust horizontal surfaces, furniture ledges and accessible fixtures.",
    html: "<p>Use a clean microfiber cloth and work top-to-bottom. Do not disturb personal documents or sensitive equipment.</p>"
  },
  {
    id: "seed_task_pantry",
    name: "Clean and reset the pantry counters, sink, coffee station and shared dining surfaces.",
    html: "<p>Remove food residue, wipe and sanitize counters, clean the sink and reset shared items neatly.</p><p>Do not dispose of labeled personal food unless site policy explicitly permits it.</p>"
  },
  {
    id: "seed_task_fire_exit",
    name: "Inspect the fire exit route and confirm doors, aisles and emergency access are unobstructed.",
    html: "<p>Walk the designated route and verify that no cartons, equipment or furniture block the path.</p><p><strong>Escalate immediately</strong> if an exit door is locked, blocked or damaged.</p>"
  },
  {
    id: "seed_task_spill_station",
    name: "Inspect the spill-response and emergency-supply station for readiness and missing items.",
    html: "<p>Confirm required absorbents, PPE and response supplies are present and accessible. Check visible damage and expiry dates where applicable.</p>"
  },
  {
    id: "seed_task_warehouse_sweep",
    name: "Sweep the warehouse aisle or dock zone and remove loose shrink-wrap, straps and debris.",
    html: "<p>Keep clear of active material-handling equipment. Collect loose packaging before it becomes a trip or entanglement hazard.</p><p>Escalate spills or damaged pallets rather than moving unsafe loads.</p>"
  },
  {
    id: "seed_task_final_inspection",
    name: "Perform a final quality inspection and report any incomplete, unsafe or damaged condition.",
    html: "<p>Walk the Work Area after the operational Tasks are complete. Compare the final condition against the expected standard.</p><ul><li>Record anything incomplete.</li><li>Photograph/report damage when required.</li><li>Escalate safety issues immediately.</li></ul>"
  }
] as const;

async function seedTasks(organizationId: string, adminId: string) {
  const result: Record<string, Awaited<ReturnType<typeof prisma.task.upsert>>> = {};

  for (const task of taskDefinitions) {
    const saved = await prisma.task.upsert({
      where: { id: task.id },
      update: {
        organizationId,
        name: task.name,
        descriptionHtml: task.html,
        status: Status.ACTIVE,
        createdById: adminId
      },
      create: {
        id: task.id,
        organizationId,
        name: task.name,
        descriptionHtml: task.html,
        status: Status.ACTIVE,
        createdById: adminId
      }
    });
    result[task.id] = saved;

    await auditOnce({
      key: `task:${task.id}`,
      organizationId,
      userId: adminId,
      action: ActionType.TASK_CREATED,
      entityType: "Task",
      entityId: saved.id,
      newValue: {
        name: saved.name,
        status: saved.status
      }
    });
  }

  return result;
}

type SeedScheduleTask = {
  taskId: string;
  minutes: number;
  evidenceRule: EvidenceRule;
  randomEveryN?: number | null;
  randomEvidenceType?: RandomEvidenceType | null;
};

type SeedSchedule = {
  id: string;
  name: string;
  workAreaId: string;
  frequencyType: ScheduleFrequencyType;
  recurrenceUnit?: ScheduleRecurrenceUnit | null;
  recurrenceInterval?: number | null;
  recurrenceConfig?: Prisma.InputJsonValue | null;
  startYmd: string;
  startTime: string;
  endYmd?: string | null;
  tasks: SeedScheduleTask[];
};

async function seedSchedules(organizationId: string, adminId: string) {
  const today = ymdInZone(new Date(), DEMO_TIMEZONE);
  const tomorrow = addLocalDays(today, 1);
  const end30 = addLocalDays(today, 30);
  const end90 = addLocalDays(today, 90);
  const end365 = addLocalDays(today, 365);
  const tomorrowDay = Number(tomorrow.slice(8, 10));

  const schedules: SeedSchedule[] = [
    {
      id: "seed_schedule_hq_lobby_open",
      name: "HQ Lobby — Morning Opening Clean",
      workAreaId: "seed_wa_hq_lobby",
      frequencyType: ScheduleFrequencyType.RECURRING,
      recurrenceUnit: ScheduleRecurrenceUnit.DAY,
      recurrenceInterval: 1,
      startYmd: today,
      startTime: "07:00",
      endYmd: end90,
      tasks: [
        { taskId: "seed_task_litter", minutes: 10, evidenceRule: EvidenceRule.NONE },
        { taskId: "seed_task_glass", minutes: 15, evidenceRule: EvidenceRule.PHOTO },
        { taskId: "seed_task_touchpoints", minutes: 15, evidenceRule: EvidenceRule.RANDOM, randomEveryN: 3, randomEvidenceType: RandomEvidenceType.PHOTO },
        { taskId: "seed_task_final_inspection", minutes: 10, evidenceRule: EvidenceRule.RANDOM, randomEveryN: 4, randomEvidenceType: RandomEvidenceType.EITHER }
      ]
    },
    {
      id: "seed_schedule_hq_conference",
      name: "HQ Conference Suite — Weekday Evening Reset",
      workAreaId: "seed_wa_hq_conference",
      frequencyType: ScheduleFrequencyType.RECURRING,
      recurrenceUnit: ScheduleRecurrenceUnit.WEEK,
      recurrenceInterval: 1,
      recurrenceConfig: { weekdays: [1, 2, 3, 4, 5] },
      startYmd: today,
      startTime: "18:00",
      endYmd: end90,
      tasks: [
        { taskId: "seed_task_waste", minutes: 10, evidenceRule: EvidenceRule.NONE },
        { taskId: "seed_task_conference_reset", minutes: 20, evidenceRule: EvidenceRule.PHOTO },
        { taskId: "seed_task_vacuum", minutes: 20, evidenceRule: EvidenceRule.RANDOM, randomEveryN: 3, randomEvidenceType: RandomEvidenceType.PHOTO }
      ]
    },
    {
      id: "seed_schedule_hq_restroom",
      name: "HQ Public Restrooms — Every 2 Hours",
      workAreaId: "seed_wa_hq_restroom",
      frequencyType: ScheduleFrequencyType.RECURRING,
      recurrenceUnit: ScheduleRecurrenceUnit.HOUR,
      recurrenceInterval: 2,
      startYmd: today,
      startTime: "08:00",
      endYmd: end30,
      tasks: [
        { taskId: "seed_task_restroom_clean", minutes: 20, evidenceRule: EvidenceRule.RANDOM, randomEveryN: 4, randomEvidenceType: RandomEvidenceType.PHOTO },
        { taskId: "seed_task_restroom_restock", minutes: 10, evidenceRule: EvidenceRule.NONE },
        { taskId: "seed_task_mop", minutes: 15, evidenceRule: EvidenceRule.NONE }
      ]
    },
    {
      id: "seed_schedule_med_touchpoints",
      name: "Medical Waiting Area — 30 Minute Touchpoint Round",
      workAreaId: "seed_wa_med_waiting",
      frequencyType: ScheduleFrequencyType.RECURRING,
      recurrenceUnit: ScheduleRecurrenceUnit.MINUTE,
      recurrenceInterval: 30,
      startYmd: today,
      startTime: "00:00",
      endYmd: end30,
      tasks: [
        { taskId: "seed_task_touchpoints", minutes: 10, evidenceRule: EvidenceRule.RANDOM, randomEveryN: 3, randomEvidenceType: RandomEvidenceType.EITHER },
        { taskId: "seed_task_litter", minutes: 5, evidenceRule: EvidenceRule.NONE }
      ]
    },
    {
      id: "seed_schedule_med_restroom",
      name: "Medical Public Restrooms — Daily Deep Clean",
      workAreaId: "seed_wa_med_restroom",
      frequencyType: ScheduleFrequencyType.RECURRING,
      recurrenceUnit: ScheduleRecurrenceUnit.DAY,
      recurrenceInterval: 1,
      startYmd: today,
      startTime: "04:00",
      endYmd: end90,
      tasks: [
        { taskId: "seed_task_restroom_clean", minutes: 30, evidenceRule: EvidenceRule.PHOTO },
        { taskId: "seed_task_restroom_restock", minutes: 10, evidenceRule: EvidenceRule.NONE },
        { taskId: "seed_task_mop", minutes: 20, evidenceRule: EvidenceRule.RANDOM, randomEveryN: 5, randomEvidenceType: RandomEvidenceType.PHOTO }
      ]
    },
    {
      id: "seed_schedule_wh_dock",
      name: "Warehouse Shipping Dock — Mon/Wed/Fri Sweep",
      workAreaId: "seed_wa_wh_dock",
      frequencyType: ScheduleFrequencyType.RECURRING,
      recurrenceUnit: ScheduleRecurrenceUnit.WEEK,
      recurrenceInterval: 1,
      recurrenceConfig: { weekdays: [1, 3, 5] },
      startYmd: today,
      startTime: "06:30",
      endYmd: end90,
      tasks: [
        { taskId: "seed_task_warehouse_sweep", minutes: 30, evidenceRule: EvidenceRule.RANDOM, randomEveryN: 3, randomEvidenceType: RandomEvidenceType.PHOTO },
        { taskId: "seed_task_fire_exit", minutes: 15, evidenceRule: EvidenceRule.NONE },
        { taskId: "seed_task_final_inspection", minutes: 10, evidenceRule: EvidenceRule.PHOTO }
      ]
    },
    {
      id: "seed_schedule_wh_monthly_safety",
      name: "Warehouse Safety Station — Monthly Readiness Inspection",
      workAreaId: "seed_wa_wh_safety",
      frequencyType: ScheduleFrequencyType.RECURRING,
      recurrenceUnit: ScheduleRecurrenceUnit.MONTH,
      recurrenceInterval: 1,
      recurrenceConfig: { monthDays: [tomorrowDay] },
      startYmd: tomorrow,
      startTime: "10:00",
      endYmd: end365,
      tasks: [
        { taskId: "seed_task_spill_station", minutes: 20, evidenceRule: EvidenceRule.PHOTO },
        { taskId: "seed_task_fire_exit", minutes: 20, evidenceRule: EvidenceRule.PHOTO },
        { taskId: "seed_task_final_inspection", minutes: 15, evidenceRule: EvidenceRule.VIDEO }
      ]
    },
    {
      id: "seed_schedule_one_time",
      name: "One-Time Executive Visitor Preparation",
      workAreaId: "seed_wa_hq_lobby",
      frequencyType: ScheduleFrequencyType.ONE_TIME,
      recurrenceUnit: null,
      recurrenceInterval: null,
      startYmd: tomorrow,
      startTime: "09:30",
      endYmd: null,
      tasks: [
        { taskId: "seed_task_glass", minutes: 15, evidenceRule: EvidenceRule.PHOTO },
        { taskId: "seed_task_dust", minutes: 15, evidenceRule: EvidenceRule.NONE },
        { taskId: "seed_task_touchpoints", minutes: 10, evidenceRule: EvidenceRule.NONE },
        { taskId: "seed_task_final_inspection", minutes: 10, evidenceRule: EvidenceRule.PHOTO }
      ]
    }
  ];

  const scheduleIds: string[] = [];

  for (const definition of schedules) {
    // On re-run, remove only future PENDING demo occurrences so the current demo
    // schedule definition can be reflected cleanly. Historical/in-progress work is preserved.
    await prisma.scheduleOccurrence.deleteMany({
      where: {
        scheduleId: definition.id,
        status: "PENDING",
        scheduledStartAt: { gt: new Date() }
      }
    });

    const saved = await prisma.schedule.upsert({
      where: { id: definition.id },
      update: {
        organizationId,
        name: definition.name,
        frequencyType: definition.frequencyType,
        recurrenceUnit: definition.recurrenceUnit ?? null,
        recurrenceInterval: definition.recurrenceInterval ?? null,
        recurrenceConfig: definition.recurrenceConfig ?? Prisma.JsonNull,
        startAt: startAt(definition.startYmd, definition.startTime),
        endDate: definition.endYmd ? dateOnly(definition.endYmd) : null,
        occurrenceGeneratedThrough: null,
        timezone: DEMO_TIMEZONE,
        workAreaId: definition.workAreaId,
        status: Status.ACTIVE,
        createdById: adminId
      },
      create: {
        id: definition.id,
        organizationId,
        name: definition.name,
        frequencyType: definition.frequencyType,
        recurrenceUnit: definition.recurrenceUnit ?? null,
        recurrenceInterval: definition.recurrenceInterval ?? null,
        recurrenceConfig: definition.recurrenceConfig ?? Prisma.JsonNull,
        startAt: startAt(definition.startYmd, definition.startTime),
        endDate: definition.endYmd ? dateOnly(definition.endYmd) : null,
        timezone: DEMO_TIMEZONE,
        workAreaId: definition.workAreaId,
        status: Status.ACTIVE,
        createdById: adminId
      }
    });

    await prisma.scheduleTask.deleteMany({ where: { scheduleId: saved.id } });

    const offsets = buildOffsets(definition.tasks.map((t) => t.minutes));
    for (let index = 0; index < definition.tasks.length; index += 1) {
      const st = definition.tasks[index];
      await prisma.scheduleTask.create({
        data: {
          scheduleId: saved.id,
          taskId: st.taskId,
          sequence: index + 1,
          durationMinutes: st.minutes,
          plannedStartOffsetMinutes: offsets[index].plannedStartOffsetMinutes,
          plannedEndOffsetMinutes: offsets[index].plannedEndOffsetMinutes,
          evidenceRule: st.evidenceRule,
          randomEveryN: st.evidenceRule === EvidenceRule.RANDOM ? st.randomEveryN ?? 3 : null,
          randomEvidenceType: st.evidenceRule === EvidenceRule.RANDOM ? st.randomEvidenceType ?? RandomEvidenceType.EITHER : null
        }
      });
    }

    await auditOnce({
      key: `schedule:${definition.id}`,
      organizationId,
      userId: adminId,
      action: ActionType.SCHEDULE_CREATED,
      entityType: "Schedule",
      entityId: saved.id,
      newValue: {
        name: saved.name,
        workAreaId: saved.workAreaId,
        frequencyType: saved.frequencyType,
        recurrenceUnit: saved.recurrenceUnit,
        recurrenceInterval: saved.recurrenceInterval,
        endDate: definition.endYmd ?? null,
        taskCount: definition.tasks.length
      }
    });

    scheduleIds.push(saved.id);
  }

  return scheduleIds;
}

export type DemoSeedResult = {
  organization: {
    id: string;
    name: string;
    timezone: string;
  };
  counts: {
    users: number;
    properties: number;
    workAreas: number;
    tasks: number;
    schedules: number;
  };
  occurrences: {
    created: number;
    skippedOutsideWorkingHours: number;
  };
  loginEmails: readonly string[];
};

export async function populateDemoData(options?: {
  actorUserId?: string | null;
  actorOrganizationId?: string | null;
  generateOccurrences?: boolean;
}) : Promise<DemoSeedResult> {
  await seedPlans();
  const { organization, admin, users } = await seedUsersAndOrganization();
  await seedProperties(organization.id, admin.id);
  await seedWorkAreas(organization.id, admin.id);
  await seedTasks(organization.id, admin.id);
  const scheduleIds = await seedSchedules(organization.id, admin.id);

  const counts = {
    users: users.length,
    properties: await prisma.property.count({ where: { organizationId: organization.id } }),
    workAreas: await prisma.workArea.count({ where: { property: { organizationId: organization.id } } }),
    tasks: await prisma.task.count({ where: { organizationId: organization.id } }),
    schedules: await prisma.schedule.count({ where: { organizationId: organization.id } })
  };

  let occurrenceCreated = 0;
  let occurrenceSkipped = 0;

  if (options?.generateOccurrences !== false) {
    for (const scheduleId of scheduleIds) {
      const result = await reconcileScheduleOccurrences(scheduleId, {
        userId: options?.actorUserId ?? admin.id,
        reason: "edit"
      });
      occurrenceCreated += result.created;
      occurrenceSkipped += result.skipped;
    }
  }

  const auditMetadata = {
    operation: "DEMO_DATA_POPULATED",
    demoOrganizationId: organization.id,
    demoOrganizationName: organization.name,
    counts,
    occurrencesCreated: occurrenceCreated,
    skippedOutsideWorkingHours: occurrenceSkipped,
    source: "admin-demo-data"
  } as Prisma.InputJsonValue;

  // Use an existing ActionType to avoid requiring a schema migration for this staging utility.
  // The metadata carries the explicit DEMO_DATA_POPULATED operation name.
  if (options?.actorOrganizationId) {
    await audit({
      organizationId: options.actorOrganizationId,
      userId: options.actorUserId ?? null,
      action: ActionType.ORGANIZATION_UPDATED,
      entityType: "DemoDataSeed",
      entityId: organization.id,
      metadata: auditMetadata
    });
  }

  if (options?.actorOrganizationId !== organization.id) {
    await audit({
      organizationId: organization.id,
      userId: admin.id,
      action: ActionType.ORGANIZATION_UPDATED,
      entityType: "DemoDataSeed",
      entityId: organization.id,
      metadata: {
        ...auditMetadata as Record<string, unknown>,
        invokedByUserId: options?.actorUserId ?? null,
        invokedFromOrganizationId: options?.actorOrganizationId ?? null
      } as Prisma.InputJsonValue
    });
  }

  return {
    organization: {
      id: organization.id,
      name: organization.name,
      timezone: organization.timezone
    },
    counts,
    occurrences: {
      created: occurrenceCreated,
      skippedOutsideWorkingHours: occurrenceSkipped
    },
    loginEmails: DEMO_LOGIN_EMAILS
  };
}
