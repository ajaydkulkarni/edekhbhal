import { describe, expect, it } from "vitest";
import { auditDiff } from "@/lib/audit-diff";

describe("auditDiff", () => {
  it("captures only changed values", () => {
    expect(
      auditDiff(
        { assignedTo: "Ravi", status: "PENDING" },
        { assignedTo: "Priya", status: "PENDING" },
      ),
    ).toEqual({
      oldValue: { assignedTo: "Ravi" },
      newValue: { assignedTo: "Priya" },
    });
  });

  it("supports create and delete semantics", () => {
    expect(auditDiff(null, { name: "Site A" })).toEqual({
      oldValue: null,
      newValue: { name: "Site A" },
    });
  });
});
