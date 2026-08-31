import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isE2ETestingEnabled } from "@/lib/e2e-testing";
import {
  readTenantDbContext,
  readTenantDbContextOutsideTransaction,
  withTenantDbContext
} from "@/lib/tenantDbContext";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value.toLowerCase();
}

function isEmptyContext(value: {
  userId: string | null;
  organizationId: string | null;
  membershipId: string | null;
  role: string | null;
}) {
  return !value.userId &&
    !value.organizationId &&
    !value.membershipId &&
    !value.role;
}

export async function POST(req: Request) {
  try {
    if (!isE2ETestingEnabled()) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    const expected = process.env.E2E_TEST_SECRET;
    if (!expected || req.headers.get("x-e2e-secret") !== expected) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const adminEmail = required("E2E_ADMIN_EMAIL");
    const pmEmail = required("E2E_PM_EMAIL");

    const [admin, pm] = await Promise.all([
      prisma.user.findUnique({
        where: { email: adminEmail },
        include: {
          memberships: {
            where: { role: "ADMIN", status: "ACTIVE" },
            take: 1
          }
        }
      }),
      prisma.user.findUnique({
        where: { email: pmEmail },
        include: {
          memberships: {
            where: { role: "PROPERTY_MANAGER", status: "ACTIVE" },
            take: 1
          }
        }
      })
    ]);

    const adminMembership = admin?.memberships[0];
    const pmMembership = pm?.memberships[0];

    if (!admin || !adminMembership) {
      return NextResponse.json(
        { error: "E2E Admin membership is unavailable." },
        { status: 400 }
      );
    }
    if (!pm || !pmMembership) {
      return NextResponse.json(
        { error: "E2E Property Manager membership is unavailable." },
        { status: 400 }
      );
    }
    if (adminMembership.organizationId !== pmMembership.organizationId) {
      return NextResponse.json(
        { error: "E2E Admin and Property Manager must belong to the same Organization." },
        { status: 400 }
      );
    }

    const outsideBefore = await readTenantDbContextOutsideTransaction();

    const adminContext = {
      userId: admin.id,
      organizationId: adminMembership.organizationId,
      membershipId: adminMembership.id,
      role: adminMembership.role
    };

    const pmContext = {
      userId: pm.id,
      organizationId: pmMembership.organizationId,
      membershipId: pmMembership.id,
      role: pmMembership.role
    };

    const insideAdmin = await withTenantDbContext(
      adminContext,
      async (tx) => readTenantDbContext(tx)
    );

    // Start a new transaction with no set_config calls. If transaction-local
    // settings leaked, this snapshot would contain values from the prior request.
    const freshTransactionAfterAdmin = await prisma.$transaction(
      async (tx) => readTenantDbContext(tx)
    );

    const insidePm = await withTenantDbContext(
      pmContext,
      async (tx) => readTenantDbContext(tx)
    );

    const freshTransactionAfterPm = await prisma.$transaction(
      async (tx) => readTenantDbContext(tx)
    );

    const outsideAfter = await readTenantDbContextOutsideTransaction();

    return NextResponse.json({
      outsideBefore,
      insideAdmin,
      freshTransactionAfterAdmin,
      insidePm,
      freshTransactionAfterPm,
      outsideAfter,
      checks: {
        outsideBeforeEmpty: isEmptyContext(outsideBefore),
        adminMatches:
          insideAdmin.userId === adminContext.userId &&
          insideAdmin.organizationId === adminContext.organizationId &&
          insideAdmin.membershipId === adminContext.membershipId &&
          insideAdmin.role === adminContext.role,
        freshAfterAdminEmpty: isEmptyContext(freshTransactionAfterAdmin),
        pmMatches:
          insidePm.userId === pmContext.userId &&
          insidePm.organizationId === pmContext.organizationId &&
          insidePm.membershipId === pmContext.membershipId &&
          insidePm.role === pmContext.role,
        freshAfterPmEmpty: isEmptyContext(freshTransactionAfterPm),
        outsideAfterEmpty: isEmptyContext(outsideAfter),
        identitiesDiffer:
          insideAdmin.userId !== insidePm.userId &&
          insideAdmin.membershipId !== insidePm.membershipId &&
          insideAdmin.role !== insidePm.role
      }
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unable to verify tenant DB context." },
      { status: 400 }
    );
  }
}
