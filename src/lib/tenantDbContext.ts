import { MembershipRole, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

export type TenantDbContext = {
  userId: string;
  organizationId: string;
  membershipId: string;
  role: MembershipRole;
};

export type TenantDbSnapshot = {
  userId: string | null;
  organizationId: string | null;
  membershipId: string | null;
  role: string | null;
};

export async function readTenantDbContext(
  tx: Prisma.TransactionClient
): Promise<TenantDbSnapshot> {
  const rows = await tx.$queryRaw<TenantDbSnapshot[]>`
    select
      public.app_user_id() as "userId",
      public.app_organization_id() as "organizationId",
      public.app_membership_id() as "membershipId",
      public.app_membership_role() as "role"
  `;
  return rows[0] ?? {
    userId: null,
    organizationId: null,
    membershipId: null,
    role: null
  };
}

export async function readTenantDbContextOutsideTransaction(): Promise<TenantDbSnapshot> {
  const rows = await prisma.$queryRaw<TenantDbSnapshot[]>`
    select
      public.app_user_id() as "userId",
      public.app_organization_id() as "organizationId",
      public.app_membership_id() as "membershipId",
      public.app_membership_role() as "role"
  `;
  return rows[0] ?? {
    userId: null,
    organizationId: null,
    membershipId: null,
    role: null
  };
}

export async function withTenantDbContext<T>(
  context: TenantDbContext,
  work: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      select set_config('app.user_id', ${context.userId}, true)
    `;
    await tx.$executeRaw`
      select set_config('app.organization_id', ${context.organizationId}, true)
    `;
    await tx.$executeRaw`
      select set_config('app.membership_id', ${context.membershipId}, true)
    `;
    await tx.$executeRaw`
      select set_config('app.role', ${context.role}, true)
    `;

    return work(tx);
  });
}
