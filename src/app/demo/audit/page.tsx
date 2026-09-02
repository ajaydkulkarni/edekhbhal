import Link from "next/link";
import { getDemoViewRole } from "@/lib/demoRole";

const rows = [
  ["Today 8:42 AM", "TASK_COMPLETED", "Emma Davis", "Butter Chicken Bowl — Metal Detection & Label Verification", "FreshBite Foods Manufacturing Plant"],
  ["Today 8:31 AM", "EVIDENCE_CAPTURED", "Olivia Brown", "Guest Room Readiness Inspection", "Grand Vista Hotel"],
  ["Today 8:14 AM", "SCHEDULE_STARTED", "Noah Williams", "Packaging Machine Breakdown Response", "Industrial Maintenance Facility"],
  ["Yesterday 4:18 PM", "WORK_AREA_QR_REPRINTED", "Maya Patel", "Main Lobby", "Grand Vista Hotel"],
  ["Yesterday 2:06 PM", "TASK_UPDATED", "Sofia Martinez", "Delight Cookies — Bake Profile & Quality Check", "FreshBite Foods Manufacturing Plant"],
];

export default async function DemoAuditPage() {
  const role = await getDemoViewRole();
  if (role === "USER") {
    return (
      <main className="container">
        <h1>Audit Trail</h1>
        <div className="card">
          <p className="muted">Audit Trail is a management view in the real workspace.</p>
          <Link href="/demo/dashboard">Return to My Work</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container">
      <div className="row">
        <div style={{ marginRight: "auto" }}>
          <h1>Audit Trail</h1>
          <p className="muted">Synthetic sample history matching the real Administration concept.</p>
        </div>
        <span className="demoReadOnlyBadge">Read-only</span>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr><th>Time</th><th>Event</th><th>User</th><th>Entity</th><th>Property</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.join(":")}>
                {row.map((value) => <td key={value}>{value}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
