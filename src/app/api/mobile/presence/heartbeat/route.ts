import { prisma } from "@/lib/prisma";
import { mobileErrorResponse, requireMobileMembership } from "@/lib/mobileAuth";

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export async function POST(req: Request) {
  try {
    const { user, membership } = await requireMobileMembership(req);
    const now = new Date();
    const staleBefore = new Date(now.getTime() - ONLINE_WINDOW_MS);

    await prisma.$executeRaw`
      INSERT INTO user_presence (
        organization_id,
        user_id,
        active_since_at,
        last_seen_at,
        is_active,
        created_at,
        updated_at
      )
      VALUES (
        ${membership.organizationId},
        ${user.id},
        ${now},
        ${now},
        TRUE,
        ${now},
        ${now}
      )
      ON CONFLICT (organization_id, user_id)
      DO UPDATE SET
        active_since_at = CASE
          WHEN user_presence.is_active = FALSE
            OR user_presence.last_seen_at < ${staleBefore}
          THEN ${now}
          ELSE user_presence.active_since_at
        END,
        last_seen_at = ${now},
        is_active = TRUE,
        updated_at = ${now}
    `;

    return Response.json({ ok: true, serverTime: now.toISOString() });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
