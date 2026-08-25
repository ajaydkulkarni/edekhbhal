import { prisma } from "./prisma";
import { ActionType, AuditResult, Prisma } from "@prisma/client";

type AuditInput = {
  organizationId?: string | null;
  userId?: string | null;
  action: ActionType;
  result?: AuditResult;
  entityType?: string;
  entityId?: string;
  oldValue?: Prisma.InputJsonValue | null;
  newValue?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
};

function jsonForPrisma(value: Prisma.InputJsonValue | null | undefined) {
  if (value === null) return Prisma.JsonNull;
  return value;
}

export async function audit(
  input: AuditInput,
  tx: Prisma.TransactionClient = prisma,
) {
  // Use the unchecked create input deliberately here. AuditLog stores the
  // organization/user foreign-key scalar IDs directly; Prisma's checked
  // relation input excludes those scalar fields and caused a TypeScript XOR
  // mismatch during the Vercel production build.
  const data: Prisma.AuditLogUncheckedCreateInput = {
    organizationId: input.organizationId ?? null,
    userId: input.userId ?? null,
    action: input.action,
    result: input.result ?? AuditResult.SUCCESS,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    oldValue: jsonForPrisma(input.oldValue),
    newValue: jsonForPrisma(input.newValue),
    metadata: jsonForPrisma(input.metadata),
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    requestId: input.requestId ?? null,
  };

  return tx.auditLog.create({ data });
}
