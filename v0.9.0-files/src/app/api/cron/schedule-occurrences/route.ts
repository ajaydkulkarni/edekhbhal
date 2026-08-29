import { NextResponse } from "next/server";
import { generateRollingOccurrences } from "@/lib/occurrenceGenerator";
import { supersedeDueOccurrences } from "@/lib/occurrenceSupersession";

export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Generate future occurrences first, then apply the due-time supersession
    // rule. Future generated rows never supersede work until scheduledStartAt.
    const generation = await generateRollingOccurrences();
    const supersession = await supersedeDueOccurrences();

    return NextResponse.json({
      ok: true,
      horizonHours: 48,
      ...generation,
      supersession,
      generatedAt: new Date().toISOString()
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Occurrence generation/reconciliation failed."
      },
      { status: 500 }
    );
  }
}
