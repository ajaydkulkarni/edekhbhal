import Link from "next/link";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { DemoRoleSimulator } from "@/components/DemoRoleSimulator";
import { LogoutButton } from "@/components/LogoutButton";
import { DEMO_WORKSPACE, type DemoRole } from "@/lib/demoWorkspace";

export function DemoWorkspaceNav({
  realOrganizationName,
  userLabel,
  demoRole,
}: {
  realOrganizationName?: string | null;
  userLabel: string;
  demoRole: DemoRole;
}) {
  const isAdmin = demoRole === "ADMIN";
  const isManager = demoRole === "PROPERTY_MANAGER";

  return (
    <>
      <div className="demoBanner">{DEMO_WORKSPACE.banner}</div>
      <header className="nav demoNav">
        <div className="navShell">
          <Link className="brand navBrand" href="/demo/dashboard">
            <span className="brandMark">BP</span>
            <span className="brandText">Best Practice Demo</span>
          </Link>

          <WorkspaceSwitcher realOrganizationName={realOrganizationName} current="DEMO" />

          <nav className="navPrimary" aria-label="Demo workspace navigation">
            <Link className="navLink" href="/demo/dashboard">
              {demoRole === "USER" ? "My Work" : "Dashboard"}
            </Link>

            <details className="navMenu">
              <summary>Operations <span aria-hidden="true">⌄</span></summary>
              <div className="navDropdown">
                {(isAdmin || isManager) && (
                  <>
                    <Link href="/demo/properties"><strong>Properties</strong><small>Same structure as real Properties</small></Link>
                    <Link href="/demo/work-areas"><strong>Work Areas</strong><small>Service status and Demo QR</small></Link>
                  </>
                )}
                <Link href="/demo/tasks"><strong>Tasks</strong><small>Browsable Task definitions</small></Link>
                <Link href="/demo/schedules"><strong>Schedules</strong><small>Browsable Schedule definitions</small></Link>
              </div>
            </details>

            <Link className="navLink" href="/demo/reports">Reports</Link>

            {(isAdmin || isManager) && (
              <details className="navMenu">
                <summary>Administration <span aria-hidden="true">⌄</span></summary>
                <div className="navDropdown navDropdownRight">
                  <Link href="/demo/team"><strong>Team</strong><small>Sample role assignments</small></Link>
                  {isAdmin && (
                    <Link href="/demo/organization"><strong>Organization</strong><small>Reference configuration</small></Link>
                  )}
                </div>
              </details>
            )}
          </nav>

          <div className="demoNavAccount">
            <DemoRoleSimulator initialRole={demoRole} />
            <span className="demoUserLabel">{userLabel}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
    </>
  );
}
