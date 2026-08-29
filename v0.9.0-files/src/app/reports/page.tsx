import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function ReportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true }
  });

  if (!membership) redirect("/onboarding");
  if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) {
    redirect("/dashboard");
  }

  return (
    <>
      <Nav />
      <main className="container">
        <h1>Reports</h1>
        <p className="muted">
          Operational reporting for {membership.organization.name}.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
            gap: 16
          }}
        >
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Service Log</h2>
            <p className="muted">
              Task-level execution history with planned versus actual duration,
              deviation, servicing user and actual start/end time.
            </p>
            <Link className="button" href="/reports/service-log">
              Open Service Log
            </Link>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Service Compliance & Analytics</h2>
            <p className="muted">
              Completed, partial and missed occurrence compliance by Property,
              Work Area, Schedule and User, with occurrence drill-down.
            </p>
            <Link className="button" href="/reports/compliance">
              Open Compliance
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
