import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { TaskEditor } from "@/components/TaskEditor";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function NewTaskPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const membership = await prisma.organizationMember.findFirst({ where: { userId: user.id, status: "ACTIVE" } });
  if (!membership) redirect("/onboarding");
  if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) redirect("/tasks");
  return <><Nav/><main className="container"><h1>Add Task</h1><TaskEditor canManage={true} mode="create" /></main></>;
}
