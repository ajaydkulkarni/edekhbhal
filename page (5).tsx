import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { TeamManager } from "@/components/TeamManager";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
export default async function TeamPage(){const user=await getSessionUser();if(!user)redirect("/login");const membership=await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"}});if(!membership)redirect("/onboarding");const members=await prisma.organizationMember.findMany({where:{organizationId:membership.organizationId},include:{user:true},orderBy:{createdAt:"asc"}});return <><Nav/><main className="container"><h1>Team / Users</h1><TeamManager members={members} canManage={membership.role==="ADMIN"} currentUserId={user.id}/></main></>}
