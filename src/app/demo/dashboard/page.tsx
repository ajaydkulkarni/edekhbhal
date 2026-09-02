import { DEMO_WORKSPACE, getDemoDashboard } from "@/lib/demoWorkspace";
import { getDemoViewRole } from "@/lib/demoRole";
import { DemoLiveOperationsDashboard } from "@/components/demo/DemoLiveOperationsDashboard";

export default async function DemoDashboardPage() {
  const role = await getDemoViewRole();
  const now = new Date();
  const dashboard = getDemoDashboard(now, role);

  return (
    <main className="container dashboardPage">
      <div className="dashboardHero">
        <div>
          <span className="eyebrow">
            {role === "USER" ? "Field-user sample workspace" : "Operations command center"}
          </span>
          <h1>{DEMO_WORKSPACE.displayName}</h1>
          <p className="muted">
            {role === "ADMIN"
              ? "Live workforce, task completions, evidence and operational exceptions — using synthetic sample data."
              : role === "PROPERTY_MANAGER"
              ? "Assigned-Property operations for FreshBite Foods Manufacturing Plant — using synthetic sample data."
              : "Sample assigned work and read-only operational context for a field User."}
          </p>
        </div>
        <div className="dashboardIdentity">
          <span>Demo perspective</span>
          <strong>
            {role === "ADMIN" ? "Admin" : role === "PROPERTY_MANAGER" ? "Property Manager" : "User"}
          </strong>
        </div>
      </div>

      <DemoLiveOperationsDashboard
        role={role}
        snapshot={dashboard}
        anchorIso={now.toISOString()}
      />
    </main>
  );
}
