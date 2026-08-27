import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { OrganizationSettings } from "@/components/OrganizationSettings";
import { WorkingHoursEditor } from "@/components/WorkingHoursEditor";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function OrganizationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true },
  });
  if (!membership) redirect("/onboarding");

  return <><Nav /><main className="container"><h1>Organization</h1><div className="card"><OrganizationSettings organization={membership.organization} canEdit={membership.role === "ADMIN"} /></div><WorkingHoursEditor title="Organization Working Hours" endpoint="/api/organizations/settings" value={membership.organization.workingHours} canEdit={membership.role === "ADMIN"} /></main></>;
}
