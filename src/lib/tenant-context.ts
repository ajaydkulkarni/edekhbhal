import { z } from "zod";

export const tenantContextSchema = z.object({
  userId: z.string().uuid(),
  organizationId: z.string().uuid(),
  membershipId: z.string().uuid(),
});

export type TenantContext = z.infer<typeof tenantContextSchema>;

export function parseTenantContext(input: unknown): TenantContext {
  return tenantContextSchema.parse(input);
}
