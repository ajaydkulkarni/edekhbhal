import Link from "next/link";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { DemoRoleSimulator } from "@/components/DemoRoleSimulator";
import { DemoDropdownMenu } from "@/components/demo/DemoDropdownMenu";
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
  const isManager = ["ADMIN", "PROPERTY_MANAGER"].includes(demoRole);

  const operationsItems = [
    {
      href: "/demo/properties",
      label: "Properties",
      description: "Buildings and assigned locations",
    },
    {
      href: "/demo/work-areas",
      label: "Work Areas",
      description: "Serviceable areas and QR",
    },
    {
      href: "/demo/tasks",
      label: "Tasks",
      description: "Reusable task masters",
    },
    {
      href: "/demo/schedules",
      label: "Schedules",
      description: "Planned recurring work",
    },
  ];

  const administrationItems = [
    {
      href: "/demo/audit",
      label: "Audit Trail",
      description: "Synthetic operational and system history",
    },
    {
      href: "/demo/team",
      label: "Team",
      description: "Personnel profiles and access",
    },
    ...(isAdmin
      ? [
          {
            href: "/demo/organization",
            label: "Organization",
            description: "Settings and working hours",
          },
          {
            href: "/demo/subscription",
            label: "Subscription",
            description: "Sample plan and account status",
          },
        ]
      : []),
  ];

  return (
    <>
      <div className="demoBanner">{DEMO_WORKSPACE.banner}</div>
      <header className="nav demoNav">
        <div className="navShell">
          <Link className="brand navBrand" href="/demo/dashboard">
            <span className="brandMark">eD</span>
            <span className="brandText">eDekhbhal</span>
          </Link>

          <WorkspaceSwitcher realOrganizationName={realOrganizationName} current="DEMO" />

          <nav className="navPrimary" aria-label="Demo workspace navigation">
            {isManager ? (
              <Link className="navLink" href="/demo/dashboard">Dashboard</Link>
            ) : (
              <Link className="navLink" href="/demo/dashboard">My Work</Link>
            )}

            <DemoDropdownMenu label="Operations" items={operationsItems} />

            {isManager ? <Link className="navLink" href="/demo/reports">Reports</Link> : null}

            {isManager ? (
              <DemoDropdownMenu
                label="Administration"
                items={administrationItems}
                alignRight
              />
            ) : null}
          </nav>

          <div className="demoNavAccount">
            <DemoRoleSimulator initialRole={demoRole} />
            <div className="orgBadge demoProfileBadge" title="Demo perspective">
              <span className="logoPlaceholder">BP</span>
              <span className="profileCopy">
                <span className="profileLabel">{userLabel}</span>
                <small>
                  {demoRole === "ADMIN"
                    ? "Admin"
                    : demoRole === "PROPERTY_MANAGER"
                    ? "Property Manager"
                    : "User"}
                </small>
              </span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
    </>
  );
}
