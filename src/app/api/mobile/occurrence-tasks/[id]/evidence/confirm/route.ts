import { ActionType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import {
  requireMobileMembership,
  mobileErrorResponse,
  MobileApiError
} from "@/lib/mobileAuth";
import {
  EVIDENCE_BUCKET,
  evidenceObjectExists,
  getEvidenceObjectInfo
} from "@/lib/supabaseStorage";


const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME: Record<"PHOTO" | "VIDEO", string[]> = {
  PHOTO: ["image/jpeg", "image/png"],
  VIDEO: ["video/mp4", "video/quicktime"]
};

const schema = z.object({
  type: z.enum(["PHOTO", "VIDEO"]),
  storagePath: z.string().min(5).max(2000),
  mimeType: z.string().min(3).max(150),
  sizeBytes: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
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
      include: {
        occurrence: true,
        evidence: true
      }
    });

    if (!task) throw new MobileApiError(404, "NOT_FOUND", "Active Task not found.");
    if (!task.evidenceRequired) {
      throw new MobileApiError(409, "EVIDENCE_NOT_REQUIRED", "Evidence is not required for this Task.");
    }
    if (task.evidence.length) {
      throw new MobileApiError(409, "EVIDENCE_ALREADY_CAPTURED", "Evidence has already been saved for this Task.");
    }

    const expectedPrefix = `${membership.organizationId}/${task.occurrenceId}/${task.id}/`;
    if (!input.storagePath.startsWith(expectedPrefix)) {
      throw new MobileApiError(403, "INVALID_STORAGE_PATH", "Evidence path does not belong to this Task.");
    }

    if (
      task.evidenceTypeRequired &&
      task.evidenceTypeRequired !== "EITHER" &&
      input.type !== task.evidenceTypeRequired
    ) {
      throw new MobileApiError(409, "WRONG_EVIDENCE_TYPE", "Evidence type does not match the Schedule requirement.");
    }

    const exists = await evidenceObjectExists(input.storagePath);
    if (!exists) {
      throw new MobileApiError(
        409,
        "UPLOAD_NOT_FOUND",
        "The evidence upload could not be verified. Please capture it again."
      );
    }

    if (!ALLOWED_MIME[input.type].includes(input.mimeType)) {
      throw new MobileApiError(400, "INVALID_MIME_TYPE", "Unsupported evidence file type.");
    }

    const objectInfo = await getEvidenceObjectInfo(input.storagePath);
    const actualSize = objectInfo.size;
    const sizeLimit = input.type === "PHOTO" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
    if (actualSize > sizeLimit) {
      throw new MobileApiError(413, "FILE_TOO_LARGE", "Captured evidence exceeds the allowed file size.");
    }
    if (objectInfo.contentType && !ALLOWED_MIME[input.type].includes(objectInfo.contentType)) {
      throw new MobileApiError(400, "INVALID_MIME_TYPE", "Uploaded evidence content type is not allowed.");
    }

    const capturedAt = new Date();

    const evidence = await prisma.$transaction(async (tx) => {
      const created = await tx.scheduleOccurrenceEvidence.create({
        data: {
          occurrenceTaskId: task.id,
          type: input.type,
          storagePath: input.storagePath,
          thumbnailPath: null,
          mimeType: objectInfo.contentType || input.mimeType,
          sizeBytes: actualSize,
          capturedAt,
          capturedById: user.id,
          metadata: {
            ...(input.metadata ?? {}),
            captureSource: "CAMERA",
            bucket: EVIDENCE_BUCKET,
            confirmedAt: capturedAt.toISOString()
          } as Prisma.InputJsonValue
        }
      });

      await audit({
        organizationId: membership.organizationId,
        userId: user.id,
        action: ActionType.EVIDENCE_CAPTURED,
        entityType: "ScheduleOccurrenceEvidence",
        entityId: created.id,
        metadata: {
          occurrenceId: task.occurrenceId,
          occurrenceTaskId: task.id,
          type: input.type,
          storagePath: input.storagePath,
          captureSource: "CAMERA"
        }
      }, tx);

      return created;
    });

    return Response.json({
      evidence: {
        id: evidence.id,
        type: evidence.type,
        mimeType: evidence.mimeType,
        sizeBytes: evidence.sizeBytes,
        capturedAt: evidence.capturedAt.toISOString()
      }
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
