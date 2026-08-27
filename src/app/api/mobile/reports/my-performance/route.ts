import { prisma } from "@/lib/prisma";
import {
  requireMobileMembership,
  mobileErrorResponse
} from "@/lib/mobileAuth";

export async function GET(req: Request) {
  try {
    const { user, membership } = await requireMobileMembership(req);
    const url = new URL(req.url);
    const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? 7)));
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const occurrences = await prisma.scheduleOccurrence.findMany({
      where: {
        organizationId: membership.organizationId,
        assignedUserId: user.id,
        completedAt: { gte: from }
      },
      include: {
        tasks: {
          orderBy: { sequence: "asc" },
          include: { evidence: true }
        }
      },
      orderBy: { completedAt: "desc" },
      take: 100
    });

    return Response.json({
      days,
      occurrences: occurrences.map((occurrence) => ({
        id: occurrence.id,
        scheduleName: occurrence.scheduleNameSnapshot,
        workAreaName: occurrence.workAreaNameSnapshot,
        propertyName: occurrence.propertyNameSnapshot,
        scheduledStartAt: occurrence.scheduledStartAt.toISOString(),
        startedAt: occurrence.startedAt?.toISOString() ?? null,
        completedAt: occurrence.completedAt?.toISOString() ?? null,
        plannedDurationMinutes: occurrence.plannedDurationMinutes,
        actualDurationSeconds: occurrence.actualDurationSeconds,
        tasks: occurrence.tasks.map((task) => ({
          sequence: task.sequence,
          name: task.taskNameSnapshot,
          plannedDurationMinutes: task.plannedDurationMinutes,
          actualDurationSeconds: task.actualDurationSeconds,
          status: task.status,
          evidenceCount: task.evidence.length
        }))
      }))
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
