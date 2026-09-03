import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Work Area + QR hardening contract", () => {
  it("keeps the clean-replay QR token helper validly dollar-quoted", () => {
    const sql = fs.readFileSync("drizzle/0004_work_area_qr_foundation.sql", "utf8");
    const start = sql.indexOf("create or replace function app_private.new_public_qr_token()");
    const end = sql.indexOf("revoke all on function app_private.new_public_qr_token() from public;", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const helper = sql.slice(start, end);
    expect(helper).toContain("as $$");
    expect(helper).toContain("$$;");
    expect(helper).not.toContain("as $\\n");
  });

  it("uses centralized product branding on the printable QR label", () => {
    const page = fs.readFileSync("src/app/workspace/work-areas/[id]/qr/page.tsx", "utf8");
    expect(page).toContain('import { brand } from "@/lib/brand";');
    expect(page).toContain('<div className="qrBrand">{brand.productName}</div>');
    expect(page).not.toContain('<div className="qrBrand">Operations Platform</div>');
  });

  it("tracks the current concise continuity structure without stale section-number assumptions", () => {
    const context = fs.readFileSync("docs/VNEXT-PROJECT-CONTEXT.md", "utf8");
    const workArea = context.indexOf("## 6. Work Area + QR Lifecycle");
    const audit = context.indexOf("## 10. Audit & Outbox");
    const demo = context.indexOf("## 11. Demo Workspace Rule — Mandatory");
    const baseline = context.indexOf("## 20. Baseline Commit Chain");

    expect(workArea).toBeGreaterThanOrEqual(0);
    expect(audit).toBeGreaterThan(workArea);
    expect(demo).toBeGreaterThan(audit);
    expect(baseline).toBeGreaterThan(demo);

    expect(context).toContain("QR identity never grants application authorization");
    expect(context).not.toContain("## 11. Billing & Entitlements Foundation");
  });
});
