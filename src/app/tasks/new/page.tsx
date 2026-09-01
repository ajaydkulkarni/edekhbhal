import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { TaskEditor } from "@/components/TaskEditor";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { findDemoTask } from "@/lib/demoWorkspace";

export default async function NewTaskPage({
  searchParams,
}: {
  searchParams?: Promise<{ demoTask?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" }
  });
  if (!membership) redirect("/onboarding");
  if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) redirect("/tasks");

  const query = searchParams ? await searchParams : {};
  const demoTask = query.demoTask ? findDemoTask(query.demoTask) : null;
  const prefill = demoTask
    ? {
        id: "",
        name: demoTask.name,
        descriptionHtml: `<p>${demoTask.description}</p>`,
        status: "ACTIVE",
        attachments: []
      }
    : undefined;

  return (
    <>
      <Nav/>
      <main className="container">
        <h1>{demoTask ? "Create Task from Best Practice Template" : "Add Task"}</h1>
        {demoTask && (
          <p className="muted">
            Prefilled from the read-only Demo Workspace. Review and adapt the Task before saving it to your Organization Workspace.
          </p>
        )}
        <TaskEditor canManage={true} mode="create" task={prefill} />
      </main>
    </>
  );
}
