import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { LiveOperationsDashboard } from "@/components/dashboard/LiveOperationsDashboard";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function Dashboard() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true },
  });
  if (!membership) redirect("/onboarding");
  if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) redirect("/tasks");

  return (
    <>
      <Nav />
      <main className="container dashboardPage">
        <div className="dashboardHero">
          <div>
            <span className="eyebrow">Operations command center</span>
            <h1>{membership.organization.name}</h1>
            <p className="muted">Live workforce, task completions, evidence and operational exceptions.</p>
          </div>
          <div className="dashboardIdentity">
            <span>{user.name ?? user.email}</span>
            <strong>{membership.role === "ADMIN" ? "Admin" : "Property Manager"}</strong>
          </div>
        </div>
        <LiveOperationsDashboard />
      </main>
    </>
  );
}
