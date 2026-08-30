import Link from "next/link";
import {redirect} from "next/navigation";
import {Nav} from "@/components/Nav";
import {getSessionUser} from "@/lib/session";
import {prisma} from "@/lib/prisma";
import {richTextToPlainText} from "@/lib/richText";

export default async function TasksPage(){
 const user=await getSessionUser();if(!user)redirect("/login");
 const membership=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"},include:{organization:true}});if(!membership)redirect("/onboarding");
 const tasks=await prisma.task.findMany({where:{organizationId:membership.organizationId,isAdHoc:false},include:{_count:{select:{attachments:true,scheduleTasks:true}}},orderBy:[{status:"asc"},{name:"asc"}]});
 const canManage=["ADMIN","PROPERTY_MANAGER"].includes(membership.role);
 return <><Nav/><main className="container nextPage"><div className="pageIntro row"><div style={{marginRight:"auto"}}><span className="eyebrow">Reusable definitions</span><h1>Task Library</h1><p className="muted">Only reusable Tasks appear here. One-off ad-hoc corrective Tasks stay out of the library unless you explicitly save them.</p></div>{canManage&&<Link className="button" href="/tasks/new">New Library Task</Link>}</div><div className="card"><table className="table"><thead><tr><th>Task</th><th>Description</th><th>Used in schedules</th><th>Attachments</th><th>Status</th><th></th></tr></thead><tbody>{tasks.map(task=>{const plain=richTextToPlainText(task.descriptionHtml);return <tr key={task.id}><td><strong>{task.name}</strong></td><td>{plain.length>140?`${plain.slice(0,140)}…`:plain||"—"}</td><td>{task._count.scheduleTasks}</td><td>{task._count.attachments}</td><td>{task.status}</td><td><Link className="button small secondary" href={`/tasks/${task.id}`}>{canManage?"View / Edit":"View"}</Link></td></tr>})}{!tasks.length&&<tr><td colSpan={6} className="muted">No reusable Tasks yet. Ad-hoc Tasks created from Schedules do not clutter this library.</td></tr>}</tbody></table></div></main></>;
}
