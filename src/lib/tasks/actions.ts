"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withTenantContext } from "@/db/runtime";
import { requireAuthenticatedUser } from "@/lib/auth/server-session";
import { getOnboardingSnapshot } from "@/lib/onboarding/server";

const taskFields = {
  name: z.string().trim().min(2).max(160),
  instructionsHtml: z.string().max(50000).optional().default(""),
};

const createSchema = z.object({
  ...taskFields,
  idempotencyKey: z.string().uuid(),
});

const updateSchema = z.object({
  ...taskFields,
  taskId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
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

export async function createTask(formData: FormData) {
  const { context } = await currentContext();
  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    instructionsHtml: formData.get("instructionsHtml") ?? "",
    idempotencyKey: formData.get("idempotencyKey"),
  });

  if (!parsed.success) {
    redirect("/workspace/tasks?error=Enter%20valid%20Task%20details.");
  }

  try {
    await withTenantContext(context, (tx) => tx`
      select app_private.create_task_master(
        ${parsed.data.name},
        ${parsed.data.instructionsHtml},
        ${parsed.data.idempotencyKey}
      )
    `);
  } catch (error) {
    redirect(`/workspace/tasks?error=${encodeURIComponent(error instanceof Error ? error.message : "Task creation failed.")}`);
  }

  revalidatePath("/workspace/tasks");
  revalidatePath("/workspace");
  redirect("/workspace/tasks?message=Task%20created.");
}

export async function updateTask(formData: FormData) {
  const { context } = await currentContext();
  const parsed = updateSchema.safeParse({
    taskId: formData.get("taskId"),
    name: formData.get("name"),
    instructionsHtml: formData.get("instructionsHtml") ?? "",
    version: formData.get("version"),
  });

  if (!parsed.success) {
    redirect("/workspace/tasks?error=Enter%20valid%20Task%20details.");
  }

  try {
    await withTenantContext(context, (tx) => tx`
      select app_private.update_task_master(
        ${parsed.data.taskId},
        ${parsed.data.name},
        ${parsed.data.instructionsHtml},
        ${parsed.data.version}
      )
    `);
  } catch (error) {
    redirect(`/workspace/tasks?error=${encodeURIComponent(error instanceof Error ? error.message : "Task update failed.")}`);
  }

  revalidatePath("/workspace/tasks");
  revalidatePath("/workspace");
  redirect("/workspace/tasks?message=Task%20updated.");
}

export async function toggleTaskStatus(formData: FormData) {
  const { context } = await currentContext();
  const id = z.string().uuid().parse(formData.get("taskId"));
  const version = z.coerce.number().int().positive().parse(formData.get("version"));
  const current = z.enum(["ACTIVE", "INACTIVE"]).parse(formData.get("currentStatus"));
  const next = current === "ACTIVE" ? "INACTIVE" : "ACTIVE";

  try {
    await withTenantContext(context, (tx) => tx`
      select app_private.set_task_master_status(
        ${id},
        ${next}::record_status,
        ${version}
      )
    `);
  } catch (error) {
    redirect(`/workspace/tasks?error=${encodeURIComponent(error instanceof Error ? error.message : "Task status change failed.")}`);
  }

  revalidatePath("/workspace/tasks");
  revalidatePath("/workspace");
  redirect("/workspace/tasks");
}

