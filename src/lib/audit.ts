import { ActionType, AuditResult, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

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
};

function jsonValue(value: Prisma.InputJsonValue | null | undefined) {
  if (value === null) return Prisma.JsonNull;
  return value;
}

export async function audit(input: AuditInput, tx: Prisma.TransactionClient = prisma) {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    organizationId: input.organizationId ?? null,
    userId: input.userId ?? null,
    action: input.action,
    result: input.result ?? AuditResult.SUCCESS,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    oldValue: jsonValue(input.oldValue),
    newValue: jsonValue(input.newValue),
    metadata: jsonValue(input.metadata)
  };
  return tx.auditLog.create({ data });
}
