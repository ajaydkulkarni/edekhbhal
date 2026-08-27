import { NextResponse } from "next/server";
import { generateRollingOccurrences } from "@/lib/occurrenceGenerator";

export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await generateRollingOccurrences();
    return NextResponse.json({ ok: true, horizonHours: 48, ...result, generatedAt: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Occurrence generation failed." }, { status: 500 });
  }
}
