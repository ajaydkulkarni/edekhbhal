import "./demo-workspace.css";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DemoWorkspaceNav } from "@/components/DemoWorkspaceNav";
import { getDemoViewRole } from "@/lib/demoRole";

export default async function DemoLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true },
  });

  const demoRole = await getDemoViewRole();

  return (
    <div className="demoWorkspaceTheme">
      <DemoWorkspaceNav
        realOrganizationName={membership?.organization.name ?? null}
        userLabel={user.name ?? user.email}
        demoRole={demoRole}
      />
      {children}
    </div>
  );
}
