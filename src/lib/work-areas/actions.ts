"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withTenantContext } from "@/db/runtime";
import { requireAuthenticatedUser } from "@/lib/auth/server-session";
import { getOnboardingSnapshot } from "@/lib/onboarding/server";

const createSchema = z.object({
  siteId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().min(2).max(32),
  description: z.string().trim().max(1000).optional().default(""),
  locationDetails: z.string().trim().max(500).optional().default(""),
  idempotencyKey: z.string().uuid(),
});

async function currentContext() {
  const user = await requireAuthenticatedUser();
  const snapshot = await getOnboardingSnapshot(user.id);
  if (!snapshot?.app_user_id || !snapshot.organization_id || !snapshot.membership_id) {
    redirect("/workspace");
  }
  return {
    user,
    context: {
      userId: snapshot.app_user_id,
      organizationId: snapshot.organization_id,
      membershipId: snapshot.membership_id,
    },
  };
}

export async function createWorkArea(formData: FormData) {
  const { context } = await currentContext();
  const parsed = createSchema.safeParse({
    siteId: formData.get("siteId"),
    name: formData.get("name"),
    code: formData.get("code"),
    description: formData.get("description") ?? "",
    locationDetails: formData.get("locationDetails") ?? "",
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) redirect("/workspace/work-areas?error=Enter%20valid%20Work%20Area%20details.");

  try {
    await withTenantContext(context, async (tx) => {
      await tx`
        select * from app_private.create_work_area_with_qr(
          ${parsed.data.siteId},
          ${parsed.data.name},
          ${parsed.data.code},
          ${parsed.data.description},
          ${parsed.data.locationDetails},
          ${parsed.data.idempotencyKey}
        )
      `;
    });
  } catch (error) {
    redirect(`/workspace/work-areas?error=${encodeURIComponent(error instanceof Error ? error.message : "Work Area creation failed.")}`);
  }

  revalidatePath("/workspace/work-areas");
  redirect("/workspace/work-areas?message=Work%20Area%20created%20with%20an%20active%20QR.");
}

export async function toggleWorkAreaStatus(formData: FormData) {
  const { context } = await currentContext();
  const id = z.string().uuid().parse(formData.get("workAreaId"));
  const version = z.coerce.number().int().positive().parse(formData.get("version"));
  const current = z.enum(["ACTIVE", "INACTIVE"]).parse(formData.get("currentStatus"));
  const next = current === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  try {
    await withTenantContext(context, async (tx) => {
      await tx`select app_private.set_work_area_status(${id}, ${next}::record_status, ${version})`;
    });
  } catch (error) {
    redirect(`/workspace/work-areas?error=${encodeURIComponent(error instanceof Error ? error.message : "Status change failed.")}`);
  }
  revalidatePath("/workspace/work-areas");
  redirect("/workspace/work-areas");
}

export async function regenerateQr(formData: FormData) {
  const { context } = await currentContext();
  const id = z.string().uuid().parse(formData.get("workAreaId"));
  const idempotencyKey = z.string().uuid().catch(randomUUID()).parse(formData.get("idempotencyKey"));

  try {
    await withTenantContext(context, async (tx) => {
      await tx`select * from app_private.regenerate_work_area_qr(${id}, ${idempotencyKey})`;
    });
  } catch (error) {
    redirect(`/workspace/work-areas?error=${encodeURIComponent(error instanceof Error ? error.message : "QR regeneration failed.")}`);
  }
  revalidatePath("/workspace/work-areas");
  redirect("/workspace/work-areas?message=QR%20regenerated.%20The%20previous%20QR%20is%20now%20invalid.");
}
