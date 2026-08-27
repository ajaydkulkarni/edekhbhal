import { ActionType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  requireMobileMembership,
  mobileErrorResponse,
  MobileApiError
} from "@/lib/mobileAuth";

const schema = z.object({
  note: z.string().trim().min(1).max(4000)
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, membership } = await requireMobileMembership(req);
    const input = schema.parse(await req.json());

    const task = await prisma.scheduleOccurrenceTask.findFirst({
      where: {
        id,
        status: "IN_PROGRESS",
        occurrence: {
          organizationId: membership.organizationId,
          assignedUserId: user.id,
          status: "IN_PROGRESS"
        }
      },
      include: { occurrence: true }
    });

    if (!task) {
      throw new MobileApiError(404, "NOT_FOUND", "Active Task not found.");
    }

    const created = await prisma.$transaction(async (tx) => {
      const note = await tx.scheduleOccurrenceNote.create({
        data: {
          occurrenceId: task.occurrenceId,
          occurrenceTaskId: task.id,
          scope: "TASK",
          note: input.note,
          createdById: user.id
        }
      });

      await audit({
        organizationId: membership.organizationId,
        userId: user.id,
        action: ActionType.TASK_NOTE_ADDED,
        entityType: "ScheduleOccurrenceNote",
        entityId: note.id,
        metadata: {
          occurrenceId: task.occurrenceId,
          occurrenceTaskId: task.id,
          taskName: task.taskNameSnapshot,
          noteLength: input.note.length
        }
      }, tx);

      return note;
    });

    return Response.json({
      note: {
        id: created.id,
        note: created.note,
        createdAt: created.createdAt.toISOString()
      }
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
