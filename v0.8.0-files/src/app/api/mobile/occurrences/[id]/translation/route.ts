import { prisma } from "@/lib/prisma";
import { requireMobileMembership, mobileErrorResponse, MobileApiError } from "@/lib/mobileAuth";
import {
  htmlToPlainText,
  normalizeSupportedLanguage,
  translateCached,
  translationProviderConfigured
} from "@/lib/translation";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { user, membership } = await requireMobileMembership(req);
    const occurrence = await prisma.scheduleOccurrence.findFirst({
      where: {
        id,
        organizationId: membership.organizationId,
        assignedUserId: user.id
      },
      include: { tasks: { orderBy: { sequence: "asc" } } }
    });
    if (!occurrence) throw new MobileApiError(404, "NOT_FOUND", "Schedule work not found.");

    const url = new URL(req.url);
    const language = normalizeSupportedLanguage(
      url.searchParams.get("language") ?? user.preferredLanguage ?? "en"
    );

    if (language === "en") {
      return Response.json({
        language,
        providerConfigured: translationProviderConfigured(),
        translated: false,
        scheduleName: occurrence.scheduleNameSnapshot,
        sourceScheduleName: occurrence.scheduleNameSnapshot,
        tasks: occurrence.tasks.map((task) => ({
          id: task.id,
          name: task.taskNameSnapshot,
          sourceName: task.taskNameSnapshot,
          descriptionText: htmlToPlainText(task.taskDescriptionSnapshot),
          sourceDescriptionText: htmlToPlainText(task.taskDescriptionSnapshot),
          nameTranslated: false,
          descriptionTranslated: false,
          translated: false
        }))
      });
    }

    const scheduleTranslation = await translateCached({
      organizationId: membership.organizationId,
      sourceType: "OCCURRENCE",
      sourceId: occurrence.id,
      fieldName: "scheduleName",
      language,
      text: occurrence.scheduleNameSnapshot
    });

    const tasks = await Promise.all(occurrence.tasks.map(async (task) => {
      const sourceDescriptionText = htmlToPlainText(task.taskDescriptionSnapshot);
      const [name, description] = await Promise.all([
        translateCached({
          organizationId: membership.organizationId,
          sourceType: "OCCURRENCE_TASK",
          sourceId: task.id,
          fieldName: "taskName",
          language,
          text: task.taskNameSnapshot
        }),
        translateCached({
          organizationId: membership.organizationId,
          sourceType: "OCCURRENCE_TASK",
          sourceId: task.id,
          fieldName: "taskDescription",
          language,
          text: sourceDescriptionText
        })
      ]);
      return {
        id: task.id,
        name: name.text,
        sourceName: task.taskNameSnapshot,
        descriptionText: description.text,
        sourceDescriptionText,
        nameTranslated: name.translated,
        descriptionTranslated: description.translated,
        translated: name.translated || description.translated
      };
    }));

    return Response.json({
      language,
      providerConfigured: translationProviderConfigured(),
      translated: scheduleTranslation.translated || tasks.some((task) => task.translated),
      scheduleName: scheduleTranslation.text,
      sourceScheduleName: occurrence.scheduleNameSnapshot,
      tasks
    });
  } catch (error) {
    return mobileErrorResponse(error);
  }
}
