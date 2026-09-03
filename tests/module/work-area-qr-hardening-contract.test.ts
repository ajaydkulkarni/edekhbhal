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

  it("keeps the continuity document section numbering aligned", () => {
    const context = fs.readFileSync("docs/VNEXT-PROJECT-CONTEXT.md", "utf8");
    expect(context).toContain("## 10. Billing & Entitlements Foundation");
    expect(context).toContain("## 11. Audit");
    expect(context.indexOf("## 10. Billing & Entitlements Foundation")).toBeLessThan(
      context.indexOf("## 11. Audit"),
    );
    expect(context).toContain("## 22. Baseline Commit Chain");
    expect(context).not.toContain("## 21. Baseline Commit Chain");
  });
});
