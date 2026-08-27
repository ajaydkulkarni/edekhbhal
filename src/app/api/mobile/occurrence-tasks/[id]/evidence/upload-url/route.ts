import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  requireMobileMembership,
  mobileErrorResponse,
  MobileApiError
} from "@/lib/mobileAuth";
import { createEvidenceSignedUpload } from "@/lib/supabaseStorage";

const schema = z.object({
  type: z.enum(["PHOTO", "VIDEO"]),
  mimeType: z.string().min(3).max(150),
  sizeBytes: z.number().int().positive().optional()
});

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

function extension(type: "PHOTO" | "VIDEO", mimeType: string) {
  if (type === "PHOTO") {
    if (mimeType === "image/png") return "png";
    return "jpg";
  }
  if (mimeType === "video/quicktime") return "mov";
  return "mp4";
}

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

    if (
      task.evidenceTypeRequired &&
      task.evidenceTypeRequired !== "EITHER" &&
      input.type !== task.evidenceTypeRequired
    ) {
      throw new MobileApiError(
        409,
        "WRONG_EVIDENCE_TYPE",
        `This Task requires ${task.evidenceTypeRequired.toLowerCase()} evidence.`
      );
    }

    const allowedMime =
      input.type === "PHOTO"
        ? ["image/jpeg", "image/png"]
        : ["video/mp4", "video/quicktime"];

    if (!allowedMime.includes(input.mimeType)) {
      throw new MobileApiError(400, "INVALID_MIME_TYPE", "Unsupported evidence file type.");
    }

    const limit = input.type === "PHOTO" ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES;
    if (input.sizeBytes && input.sizeBytes > limit) {
      throw new MobileApiError(
        413,
        "FILE_TOO_LARGE",
        input.type === "PHOTO"
          ? "Photo evidence must be 10 MB or smaller."
          : "Video evidence must be 50 MB or smaller."
      );
    }

    const filename = `${crypto.randomUUID()}.${extension(input.type, input.mimeType)}`;
    const path = [
      membership.organizationId,
      task.occurrenceId,
      task.id,
      filename
    ].join("/");

    const signed = await createEvidenceSignedUpload(path);

    return Response.json({
      ...signed,
      type: input.type,
      mimeType: input.mimeType,
      maxSizeBytes: limit,
      expiresInSeconds: 7200
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
