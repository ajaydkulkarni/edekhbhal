import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sha256 } from "@/lib/security";
import { isE2ETestingEnabled } from "@/lib/e2e-testing";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value.toLowerCase();
}

export async function POST(req: Request) {
  try {
    if (!isE2ETestingEnabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
    const expected = process.env.E2E_TEST_SECRET;
    if (!expected || req.headers.get("x-e2e-secret") !== expected) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const adminEmail = required("E2E_ADMIN_EMAIL");
    const pmEmail = required("E2E_PM_EMAIL");
    const userEmail = required("E2E_USER_EMAIL");
    const unassignedEmail = required("E2E_UNASSIGNED_EMAIL");

    const admin = await prisma.user.findUnique({
      where: { email: adminEmail },
      include: { memberships: { where: { role: "ADMIN", status: "ACTIVE" } } }
    });
    const adminMembership = admin?.memberships[0];
    if (!admin || !adminMembership) {
      return NextResponse.json({ error: "E2E_ADMIN_EMAIL must be an existing active Admin." }, { status: 400 });
    }

    const organizationId = adminMembership.organizationId;

    async function ensureUser(email: string, name: string, role: "PROPERTY_MANAGER" | "USER") {
      const user = await prisma.user.upsert({
        where: { email },
        update: { name, active: true, emailVerified: new Date() },
        create: { email, name, active: true, emailVerified: new Date() }
      });
      const membership = await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId, userId: user.id } },
        update: { role, status: "ACTIVE" },
        create: { organizationId, userId: user.id, role, status: "ACTIVE" }
      });
      return { user, membership };
    }

    async function ensureProperty(name: string) {
      const existing = await prisma.property.findFirst({ where: { organizationId, name } });
      if (existing) return prisma.property.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
      return prisma.property.create({
        data: {
          organizationId,
          name,
          addressLine1: "100 E2E Test Way",
          city: "Salt Lake City",
          state: "UT",
          postalCode: "84101",
          country: "USA",
          timezone: "America/Denver",
          status: "ACTIVE"
        }
      });
    }

    async function ensureWorkArea(propertyId: string, name: string) {
      const existing = await prisma.workArea.findFirst({ where: { propertyId, name } });
      if (existing) return prisma.workArea.update({ where: { id: existing.id }, data: { status: "ACTIVE" } });
      return prisma.workArea.create({ data: { propertyId, name, status: "ACTIVE" } });
    }

    const pm = await ensureUser(pmEmail, "E2E Property Manager", "PROPERTY_MANAGER");
    const user = await ensureUser(userEmail, "E2E User Assigned", "USER");
    const unassigned = await ensureUser(unassignedEmail, "E2E User Unassigned", "USER");
    const propertyA = await ensureProperty("E2E Property A");
    const propertyB = await ensureProperty("E2E Property B");

    await prisma.organizationMemberProperty.deleteMany({
      where: { organizationMemberId: { in: [pm.membership.id, user.membership.id, unassigned.membership.id] } }
    });
    await prisma.organizationMemberProperty.createMany({
      data: [
        { organizationMemberId: pm.membership.id, propertyId: propertyA.id, assignedById: admin.id },
        { organizationMemberId: user.membership.id, propertyId: propertyA.id, assignedById: admin.id }
      ],
      skipDuplicates: true
    });

    const nextWorkArea = await ensureWorkArea(propertyA.id, "E2E Next Work Area");

    let nextTask = await prisma.task.findFirst({
      where: { organizationId, name: "E2E Next Schedule Task" }
    });
    nextTask = nextTask
      ? await prisma.task.update({
          where: { id: nextTask.id },
          data: { status: "ACTIVE", isAdHoc: false, descriptionHtml: "<p>E2E Next deterministic Task.</p>" }
        })
      : await prisma.task.create({
          data: {
            organizationId,
            name: "E2E Next Schedule Task",
            descriptionHtml: "<p>E2E Next deterministic Task.</p>",
            isAdHoc: false,
            status: "ACTIVE",
            createdById: admin.id
          }
        });

    let nextSchedule = await prisma.schedule.findFirst({
      where: { organizationId, name: "E2E Next QR Schedule" }
    });
    const nextStart = new Date(Date.now() + 60 * 60 * 1000);
    nextSchedule = nextSchedule
      ? await prisma.schedule.update({
          where: { id: nextSchedule.id },
          data: {
            frequencyType: "ONE_TIME",
            recurrenceUnit: null,
            recurrenceInterval: null,
            recurrenceConfig: undefined,
            startAt: nextStart,
            endDate: null,
            timezone: "America/Denver",
            workAreaId: nextWorkArea.id,
            status: "ACTIVE"
          }
        })
      : await prisma.schedule.create({
          data: {
            organizationId,
            name: "E2E Next QR Schedule",
            frequencyType: "ONE_TIME",
            startAt: nextStart,
            timezone: "America/Denver",
            workAreaId: nextWorkArea.id,
            status: "ACTIVE",
            createdById: admin.id
          }
        });

    await prisma.scheduleTask.upsert({
      where: { scheduleId_sequence: { scheduleId: nextSchedule.id, sequence: 1 } },
      update: {
        taskId: nextTask.id,
        durationMinutes: 30,
        plannedStartOffsetMinutes: 0,
        plannedEndOffsetMinutes: 30,
        evidenceRule: "NONE",
        randomEveryN: null,
        randomEvidenceType: null
      },
      create: {
        scheduleId: nextSchedule.id,
        taskId: nextTask.id,
        sequence: 1,
        durationMinutes: 30,
        plannedStartOffsetMinutes: 0,
        plannedEndOffsetMinutes: 30,
        evidenceRule: "NONE"
      }
    });

    const qrTokenHash = sha256(`e2e-next-work-area:${nextWorkArea.id}`);
    const existingQrByHash = await prisma.qrCode.findUnique({ where: { tokenHash: qrTokenHash } });
    const nextQr = existingQrByHash
      ? await prisma.qrCode.update({
          where: { id: existingQrByHash.id },
          data: {
            workAreaId: nextWorkArea.id,
            status: "ACTIVE",
            generatedAt: new Date(),
            generatedById: admin.id,
            revokedAt: null,
            revokedById: null
          }
        })
      : await prisma.qrCode.create({
          data: {
            workAreaId: nextWorkArea.id,
            tokenHash: qrTokenHash,
            tokenPreview: "E2E-NEXT",
            status: "ACTIVE",
            generatedById: admin.id
          }
        });

    // Cross-tenant security fixture. No E2E test identity receives membership
    // in this Organization. Existing sessions must therefore be denied.
    const foreignOrganizationName = "E2E Foreign Organization";
    let foreignOrganization = await prisma.organization.findFirst({
      where: { name: foreignOrganizationName }
    });
    foreignOrganization = foreignOrganization
      ? await prisma.organization.update({
          where: { id: foreignOrganization.id },
          data: { timezone: "America/Denver" }
        })
      : await prisma.organization.create({
          data: { name: foreignOrganizationName, timezone: "America/Denver" }
        });

    const foreignPropertyName = "E2E Foreign Property";
    let foreignProperty = await prisma.property.findFirst({
      where: { organizationId: foreignOrganization.id, name: foreignPropertyName }
    });
    foreignProperty = foreignProperty
      ? await prisma.property.update({
          where: { id: foreignProperty.id },
          data: { status: "ACTIVE", timezone: "America/Denver" }
        })
      : await prisma.property.create({
          data: {
            organizationId: foreignOrganization.id,
            name: foreignPropertyName,
            addressLine1: "200 Foreign Test Way",
            city: "Salt Lake City",
            state: "UT",
            postalCode: "84101",
            country: "USA",
            timezone: "America/Denver",
            status: "ACTIVE"
          }
        });

    const foreignWorkAreaName = "E2E Foreign Work Area";
    let foreignWorkArea = await prisma.workArea.findFirst({
      where: { propertyId: foreignProperty.id, name: foreignWorkAreaName }
    });
    foreignWorkArea = foreignWorkArea
      ? await prisma.workArea.update({
          where: { id: foreignWorkArea.id },
          data: { status: "ACTIVE" }
        })
      : await prisma.workArea.create({
          data: {
            propertyId: foreignProperty.id,
            name: foreignWorkAreaName,
            status: "ACTIVE"
          }
        });

    const foreignTaskName = "E2E Foreign Task";
    let foreignTask = await prisma.task.findFirst({
      where: { organizationId: foreignOrganization.id, name: foreignTaskName }
    });
    foreignTask = foreignTask
      ? await prisma.task.update({
          where: { id: foreignTask.id },
          data: {
            status: "ACTIVE",
            isAdHoc: false,
            descriptionHtml: "<p>Cross-tenant E2E Task.</p>"
          }
        })
      : await prisma.task.create({
          data: {
            organizationId: foreignOrganization.id,
            name: foreignTaskName,
            descriptionHtml: "<p>Cross-tenant E2E Task.</p>",
            isAdHoc: false,
            status: "ACTIVE",
            createdById: admin.id
          }
        });

    const foreignScheduleName = "E2E Foreign Schedule";
    let foreignSchedule = await prisma.schedule.findFirst({
      where: { organizationId: foreignOrganization.id, name: foreignScheduleName }
    });
    const foreignStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
    foreignSchedule = foreignSchedule
      ? await prisma.schedule.update({
          where: { id: foreignSchedule.id },
          data: {
            frequencyType: "ONE_TIME",
            recurrenceUnit: null,
            recurrenceInterval: null,
            startAt: foreignStart,
            endDate: null,
            timezone: "America/Denver",
            workAreaId: foreignWorkArea.id,
            status: "ACTIVE"
          }
        })
      : await prisma.schedule.create({
          data: {
            organizationId: foreignOrganization.id,
            name: foreignScheduleName,
            frequencyType: "ONE_TIME",
            startAt: foreignStart,
            timezone: "America/Denver",
            workAreaId: foreignWorkArea.id,
            status: "ACTIVE",
            createdById: admin.id
          }
        });

    await prisma.scheduleTask.upsert({
      where: { scheduleId_sequence: { scheduleId: foreignSchedule.id, sequence: 1 } },
      update: {
        taskId: foreignTask.id,
        durationMinutes: 15,
        plannedStartOffsetMinutes: 0,
        plannedEndOffsetMinutes: 15,
        evidenceRule: "NONE",
        randomEveryN: null,
        randomEvidenceType: null
      },
      create: {
        scheduleId: foreignSchedule.id,
        taskId: foreignTask.id,
        sequence: 1,
        durationMinutes: 15,
        plannedStartOffsetMinutes: 0,
        plannedEndOffsetMinutes: 15,
        evidenceRule: "NONE"
      }
    });

    return NextResponse.json({
      organizationId,
      admin: { id: admin.id, email: admin.email, membershipId: adminMembership.id },
      pm: { id: pm.user.id, email: pm.user.email, membershipId: pm.membership.id },
      user: { id: user.user.id, email: user.user.email, membershipId: user.membership.id },
      unassigned: { id: unassigned.user.id, email: unassigned.user.email, membershipId: unassigned.membership.id },
      propertyA: { id: propertyA.id, name: propertyA.name },
      propertyB: { id: propertyB.id, name: propertyB.name },
      nextWorkArea: { id: nextWorkArea.id, name: nextWorkArea.name },
      nextSchedule: { id: nextSchedule.id, name: nextSchedule.name },
      nextQr: { id: nextQr.id },
      foreignOrganization: {
        id: foreignOrganization.id,
        name: foreignOrganization.name,
        property: { id: foreignProperty.id, name: foreignProperty.name },
        workArea: { id: foreignWorkArea.id, name: foreignWorkArea.name },
        task: { id: foreignTask.id, name: foreignTask.name },
        schedule: { id: foreignSchedule.id, name: foreignSchedule.name }
      }
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to prepare E2E fixtures." },
      { status: 400 }
    );
  }
}
