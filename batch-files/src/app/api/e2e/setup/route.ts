import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function enabled() {
  return process.env.E2E_TESTING_ENABLED === "true" && process.env.VERCEL_ENV !== "production";
}
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value.toLowerCase();
}
export async function POST(req: Request) {
  try {
    if (!enabled()) return NextResponse.json({ error: "Not found." }, { status: 404 });
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
          organizationId, name, addressLine1: "100 E2E Test Way", city: "Salt Lake City",
          state: "UT", postalCode: "84101", country: "USA",
          timezone: "America/Denver", status: "ACTIVE"
        }
      });
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

    return NextResponse.json({
      organizationId,
      admin: { id: admin.id, email: admin.email, membershipId: adminMembership.id },
      pm: { id: pm.user.id, email: pm.user.email, membershipId: pm.membership.id },
      user: { id: user.user.id, email: user.user.email, membershipId: user.membership.id },
      unassigned: { id: unassigned.user.id, email: unassigned.user.email, membershipId: unassigned.membership.id },
      propertyA: { id: propertyA.id, name: propertyA.name },
      propertyB: { id: propertyB.id, name: propertyB.name }
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unable to prepare E2E fixtures." }, { status: 400 });
  }
}
