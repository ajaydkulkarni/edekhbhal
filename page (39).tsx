import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { TaskEditor } from "@/components/TaskEditor";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await prisma.organizationMember.findFirst({ where: { userId: user.id, status: "ACTIVE" } });
  if (!membership) redirect("/onboarding");

  const task = await prisma.task.findUnique({
    where: { id },
    include: { attachments: { orderBy: { createdAt: "asc" } } }
  });
  if (!task || task.organizationId !== membership.organizationId) notFound();
  const canManage = ["ADMIN", "PROPERTY_MANAGER"].includes(membership.role);

  return <><Nav/><main className="container">
    <div className="breadcrumbs"><Link href="/tasks">Tasks</Link> / {task.name}</div>
    <div className="row"><h1 style={{ marginRight: "auto" }}>Task</h1><span className={`statusPill ${task.status.toLowerCase()}`}>{task.status}</span></div>
    <TaskEditor task={{
      id: task.id,
      name: task.name,
      descriptionHtml: task.descriptionHtml,
      status: task.status,
      attachments: task.attachments.map(a => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, sizeBytes: a.sizeBytes }))
    }} canManage={canManage} mode="edit" />
  </main></>;
}
