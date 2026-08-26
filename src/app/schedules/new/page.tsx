import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { ScheduleEditor } from "@/components/ScheduleEditor";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function NewSchedulePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true }
  });
  if (!membership) redirect("/onboarding");
  if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) redirect("/schedules");

  const [workAreas, tasks] = await Promise.all([
    prisma.workArea.findMany({
      where: { status: "ACTIVE", property: { organizationId: membership.organizationId, status: "ACTIVE" } },
      include: { property: true },
      orderBy: [{ property: { name: "asc" } }, { name: "asc" }]
    }),
    prisma.task.findMany({
      where: { organizationId: membership.organizationId, status: "ACTIVE" },
      orderBy: { name: "asc" }
    })
  ]);

  const waOptions = workAreas.map((wa) => ({
    id: wa.id,
    name: wa.name,
    propertyName: wa.property.name,
    timezone: wa.property.timezone || membership.organization.timezone,
    status: wa.status,
    propertyStatus: wa.property.status
  }));
  const taskOptions = tasks.map((task) => ({ id: task.id, name: task.name, status: task.status }));

  return <><Nav/><main className="container">
    <h1>Create Schedule</h1>
    <p className="muted">Only Admins and Property Managers can create or edit Schedules.</p>
    <ScheduleEditor canManage={true} workAreas={waOptions} tasks={taskOptions}/>
  </main></>;
}
