import * as XLSX from "xlsx";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { zonedLocalToUtc } from "@/lib/schedule";

function dateOk(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function nextDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: Date | null, tz: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(value);
}

function formatTime(value: Date | null, tz: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(value);
}

function duration(seconds: number | null | undefined) {
  if (seconds == null) return "";
  const n = Math.max(0, Math.floor(seconds));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const s = n % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true }
  });

  if (
    !membership ||
    !["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const propertyId = url.searchParams.get("propertyId") || "";
  const workAreaId = url.searchParams.get("workAreaId") || "";
  const scheduleId = url.searchParams.get("scheduleId") || "";
  const userId = url.searchParams.get("userId") || "";
  const dateFrom = dateOk(url.searchParams.get("dateFrom"));
  const dateTo = dateOk(url.searchParams.get("dateTo"));

  const dateFilter =
    dateFrom || dateTo
      ? {
          ...(dateFrom
            ? {
                gte: zonedLocalToUtc(
                  `${dateFrom}T00:00`,
                  membership.organization.timezone
                )
              }
            : {}),
          ...(dateTo
            ? {
                lt: zonedLocalToUtc(
                  `${nextDate(dateTo)}T00:00`,
                  membership.organization.timezone
                )
              }
            : {})
        }
      : { not: null };

  const rows = await prisma.scheduleOccurrenceTask.findMany({
    where: {
      status: "COMPLETED",
      actualStartAt: dateFilter,
      occurrence: {
        organizationId: membership.organizationId,
        ...(propertyId ? { workArea: { propertyId } } : {}),
        ...(workAreaId ? { workAreaId } : {}),
        ...(scheduleId ? { scheduleId } : {}),
        ...(userId ? { assignedUserId: userId } : {})
      }
    },
    include: {
      occurrence: {
        include: {
          assignedUser: { select: { name: true, email: true } }
        }
      }
    },
    orderBy: { actualStartAt: "desc" },
    take: 5000
  });

  const exportRows = rows.map((row) => {
    const o = row.occurrence;
    const actualSeconds =
      row.actualDurationSeconds ??
      (row.actualStartAt && row.actualEndAt
        ? Math.max(
            0,
            Math.floor(
              (row.actualEndAt.getTime() - row.actualStartAt.getTime()) / 1000
            )
          )
        : null);
    const deviation =
      actualSeconds == null
        ? null
        : actualSeconds - row.plannedDurationMinutes * 60;

    return {
      Property: o.propertyNameSnapshot,
      "Work Area": o.workAreaNameSnapshot,
      Schedule: o.scheduleNameSnapshot,
      Sequence: row.sequence,
      Task: row.taskNameSnapshot,
      "Actual Duration": duration(actualSeconds),
      "Planned Duration": duration(row.plannedDurationMinutes * 60),
      "Deviation Seconds": deviation ?? "",
      User: o.assignedUser?.name ?? o.assignedUser?.email ?? "",
      Date: formatDate(row.actualStartAt, o.timezone),
      "Start Time": formatTime(row.actualStartAt, o.timezone),
      "End Time": formatTime(row.actualEndAt, o.timezone)
    };
  });

  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const sheet = XLSX.utils.json_to_sheet(exportRows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Service Log");
    const binary = XLSX.write(book, { type: "buffer", bookType: "xlsx" });

    return new Response(new Uint8Array(binary), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          `attachment; filename="edekhbhal-service-log-${stamp}.xlsx"`,
        "Cache-Control": "private, no-store"
      }
    });
  }

  const headers = Object.keys(
    exportRows[0] ?? {
      Property: "",
      "Work Area": "",
      Schedule: "",
      Sequence: "",
      Task: "",
      "Actual Duration": "",
      "Planned Duration": "",
      "Deviation Seconds": "",
      User: "",
      Date: "",
      "Start Time": "",
      "End Time": ""
    }
  );

  const csv = [
    headers.map(csvCell).join(","),
    ...exportRows.map((row) =>
      headers.map((header) => csvCell((row as any)[header])).join(",")
    )
  ].join("\r\n");

  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        `attachment; filename="edekhbhal-service-log-${stamp}.csv"`,
      "Cache-Control": "private, no-store"
    }
  });
}
