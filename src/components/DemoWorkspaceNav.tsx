import Link from "next/link";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { DemoRoleSimulator } from "@/components/DemoRoleSimulator";
import { LogoutButton } from "@/components/LogoutButton";
import { DEMO_WORKSPACE } from "@/lib/demoWorkspace";

export function DemoWorkspaceNav({
  realOrganizationName,
  userLabel,
}: {
  realOrganizationName: string;
  userLabel: string;
}) {
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
            <Link className="navLink" href="/demo/dashboard">Dashboard</Link>
            <details className="navMenu">
              <summary>Operations <span aria-hidden="true">⌄</span></summary>
              <div className="navDropdown">
                <Link href="/demo/properties"><strong>Properties</strong><small>Four industry examples</small></Link>
                <Link href="/demo/work-areas"><strong>Work Areas</strong><small>Operational areas and demo QR</small></Link>
                <Link href="/demo/tasks"><strong>Tasks</strong><small>Best-practice Task library</small></Link>
                <Link href="/demo/schedules"><strong>Schedules</strong><small>Realistic operating schedules</small></Link>
              </div>
            </details>
            <Link className="navLink" href="/demo/reports">Reports</Link>
            <details className="navMenu">
              <summary>Administration <span aria-hidden="true">⌄</span></summary>
              <div className="navDropdown navDropdownRight">
                <Link href="/demo/team"><strong>Team</strong><small>Sample role assignments</small></Link>
                <Link href="/demo/organization"><strong>Organization</strong><small>Reference configuration</small></Link>
              </div>
            </details>
          </nav>

          <div className="demoNavAccount">
            <DemoRoleSimulator />
            <span className="demoUserLabel">{userLabel}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
    </>
  );
}
