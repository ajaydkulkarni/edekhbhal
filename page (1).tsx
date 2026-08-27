import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { richTextToPlainText } from "@/lib/richText";

export default async function TasksPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true }
  });
  if (!membership) redirect("/onboarding");

  const tasks = await prisma.task.findMany({
    where: { organizationId: membership.organizationId },
    include: { _count: { select: { attachments: true } } },
    orderBy: [{ status: "asc" }, { name: "asc" }]
  });
  const canManage = ["ADMIN", "PROPERTY_MANAGER"].includes(membership.role);

  return <><Nav/><main className="container">
    <div className="row">
      <div style={{ marginRight: "auto" }}>
        <h1>Tasks</h1>
        <p className="muted">Organization-level reusable task definitions for {membership.organization.name}.</p>
      </div>
      {canManage && <Link className="button" href="/tasks/new">Add Task</Link>}
    </div>
    <div className="card">
      <table className="table">
        <thead><tr><th>Task</th><th>Description</th><th>Attachments</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {tasks.map((task) => {
            const plain = richTextToPlainText(task.descriptionHtml);
            return <tr key={task.id}>
              <td style={{ maxWidth: 360 }}><strong>{task.name}</strong></td>
              <td style={{ maxWidth: 360 }}>{plain.length > 140 ? `${plain.slice(0, 140)}…` : plain || "—"}</td>
              <td>{task._count.attachments}</td>
              <td>{task.status}</td>
              <td><Link className="button small secondary" href={`/tasks/${task.id}`}>{canManage ? "View / Edit" : "View"}</Link></td>
            </tr>;
          })}
          {!tasks.length && <tr><td colSpan={5} className="muted">No tasks have been created yet.</td></tr>}
        </tbody>
      </table>
    </div>
  </main></>;
}
