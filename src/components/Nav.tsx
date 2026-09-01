import Link from "next/link";
import {getSessionUser} from "@/lib/session";
import {prisma} from "@/lib/prisma";
import {isDemoDataEnabled} from "@/lib/demoDataAccess";
import {LogoutButton} from "@/components/LogoutButton";
import {WorkspaceSwitcher} from "@/components/WorkspaceSwitcher";

export async function Nav(){
 const user=await getSessionUser();
 const membership=user?await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"},include:{organization:true}}):null;
 const initials=membership?.organization.name?.slice(0,2).toUpperCase()??"ED";
 const isAdmin=membership?.role==="ADMIN";
 const isManager=membership?["ADMIN","PROPERTY_MANAGER"].includes(membership.role):false;
 const brandHref=isManager?"/dashboard":"/tasks";
 return <header className="nav"><div className="navShell">
  <Link className="brand navBrand" href={brandHref}><span className="brandMark">eD</span><span className="brandText">eDekhbhal</span></Link>
  {membership&&<WorkspaceSwitcher realOrganizationName={membership.organization.name} current="REAL"/>}
  <nav className="navPrimary" aria-label="Primary navigation">
   {isManager&&<Link className="navLink" href="/dashboard">Dashboard</Link>}
   <details className="navMenu"><summary>Operations <span aria-hidden="true">⌄</span></summary><div className="navDropdown">
    <Link href="/properties"><strong>Properties</strong><small>Buildings and assigned locations</small></Link>
    <Link href="/work-areas"><strong>Work Areas</strong><small>Serviceable areas and QR</small></Link>
    <Link href="/tasks"><strong>Tasks</strong><small>Reusable task masters</small></Link>
    <Link href="/schedules"><strong>Schedules</strong><small>Planned recurring work</small></Link>
   </div></details>
   {isManager&&<Link className="navLink" href="/reports">Reports</Link>}
   {isManager&&<details className="navMenu"><summary>Administration <span aria-hidden="true">⌄</span></summary><div className="navDropdown navDropdownRight">
    <Link href="/audit"><strong>Audit Trail</strong><small>Operational and system history</small></Link>
    <Link href="/team"><strong>Team</strong><small>Personnel profiles and access</small></Link>
    {isAdmin&&<Link href="/organization"><strong>Organization</strong><small>Settings and working hours</small></Link>}
    {isAdmin&&<Link href="/subscription"><strong>Subscription</strong><small>Plan and account status</small></Link>}
    {isAdmin&&isDemoDataEnabled()&&<Link href="/admin/demo-data"><strong>Demo Data</strong><small>Staging seed utility</small></Link>}
   </div></details>}
  </nav>
  <div className="navAccount"><Link className="orgBadge" href="/profile" title="My Profile">
   {membership?.organization.logoUrl?<img src={membership.organization.logoUrl} alt={`${membership.organization.name} logo`}/>:<span className="logoPlaceholder">{initials}</span>}
   <span className="profileCopy"><span className="profileLabel">{user?.name||user?.email||"Profile"}</span><small>{membership?.role?.replace("PROPERTY_MANAGER","Property Manager")??""}</small></span>
  </Link>{user&&<LogoutButton/>}</div>
 </div></header>;
}
