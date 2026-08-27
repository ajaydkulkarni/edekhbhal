import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { DemoDataManager } from "@/components/DemoDataManager";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isDemoDataEnabled } from "@/lib/demoDataAccess";
import { DEMO_ORG_ID } from "@/lib/demoSeed";

export default async function DemoDataPage() {
  if (!isDemoDataEnabled()) notFound();

  const user = await getSessionUser();
  if (!user) redirect("/login");

  const adminMembership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE", role: "ADMIN" }
  });
  if (!adminMembership) notFound();

  const demoOrganization = await prisma.organization.findUnique({
    where: { id: DEMO_ORG_ID },
    select: { id: true }
  });

  const initialCounts = demoOrganization ? {
    users: await prisma.organizationMember.count({ where: { organizationId: DEMO_ORG_ID } }),
    properties: await prisma.property.count({ where: { organizationId: DEMO_ORG_ID } }),
    workAreas: await prisma.workArea.count({ where: { property: { organizationId: DEMO_ORG_ID } } }),
    tasks: await prisma.task.count({ where: { organizationId: DEMO_ORG_ID } }),
    schedules: await prisma.schedule.count({ where: { organizationId: DEMO_ORG_ID } })
  } : null;

  return <><Nav/><main className="container">
    <h1>Demo Data</h1>
    <p className="muted">
      Staging-only Admin utility for populating the canonical eDekhbhal demo dataset in Supabase.
    </p>
    <DemoDataManager initialExists={Boolean(demoOrganization)} initialCounts={initialCounts}/>
  </main></>;
}
