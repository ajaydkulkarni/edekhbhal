import Link from "next/link";
import {redirect} from "next/navigation";
import {requireAuthenticatedUser} from "@/lib/auth/server-session";
import {signOut} from "@/lib/auth/actions";
import {getOnboardingSnapshot,onboardingPath} from "@/lib/onboarding/server";
import {countUpcomingOccurrences} from "@/lib/occurrences/server";
import {listSchedules} from "@/lib/schedules/server";
import {listTasks} from "@/lib/tasks/server";
import {listWorkAreas} from "@/lib/work-areas/server";

export default async function WorkspacePage(){
 const user=await requireAuthenticatedUser(),snapshot=await getOnboardingSnapshot(user.id);
 if(!snapshot||snapshot.onboarding_state!=="ONBOARDING_COMPLETE")redirect(onboardingPath(snapshot?.onboarding_state??"REGISTERED"));
 if(!snapshot.app_user_id||!snapshot.organization_id||!snapshot.membership_id)redirect("/login");
 const context={userId:snapshot.app_user_id,organizationId:snapshot.organization_id,membershipId:snapshot.membership_id};
 const[workAreas,tasks,schedules,occurrences]=await Promise.all([listWorkAreas(context),listTasks(context),listSchedules(context),countUpcomingOccurrences(context)]);
 return <main className="workspacePage">
  <header className="workspaceHeader"><div><span className="eyebrow">ORGANIZATION WORKSPACE</span><h1>{snapshot.organization_name}</h1><p>{snapshot.site_name} · {snapshot.plan_code}</p></div><form action={signOut}><button className="button secondaryButton" type="submit">Sign out</button></form></header>
  <section className="workspaceGrid">
   <article className="metricCard"><span>Role</span><strong>{snapshot.role_code}</strong><p>Organization-scoped authorization is active.</p></article>
   <article className="metricCard"><span>Site</span><strong>{snapshot.site_name}</strong><p>Site hierarchy is ready for operational Work Areas.</p></article>
   <article className="metricCard"><span>Work Areas</span><strong>{workAreas.length}</strong><p>Each Work Area owns one active QR identity.</p></article>
   <article className="metricCard"><span>Tasks</span><strong>{tasks.length}</strong><p>Reusable Organization-level work instructions.</p></article>
   <article className="metricCard"><span>Schedules</span><strong>{schedules.length}</strong><p>Local-time planning masters.</p></article>
   <article className="metricCard"><span>Occurrences</span><strong>{occurrences}</strong><p>Upcoming generated planning snapshots.</p></article>
  </section>
  <section className="workspacePanel"><span className="eyebrow">SITE OPERATIONS</span><h2>Site → Work Areas → QR identity</h2><p>Create operational areas, print the current QR label, or regenerate a compromised QR.</p><Link className="button" href="/workspace/work-areas">Manage Work Areas</Link></section>
  <section className="workspacePanel"><span className="eyebrow">TASK LIBRARY</span><h2>Reusable Task masters</h2><p>Maintain Organization-level Tasks that can be composed into Schedules.</p><Link className="button" href="/workspace/tasks">Manage Tasks</Link></section>
  <section className="workspacePanel"><span className="eyebrow">PLANNING</span><h2>Schedule masters</h2><p>Bind an accessible Work Area to ordered Tasks while preserving Site-local timing intent.</p><Link className="button" href="/workspace/schedules">Manage Schedules</Link></section>
  <section className="workspacePanel"><span className="eyebrow">GENERATED PLANNING</span><h2>Occurrence snapshots</h2><p>Review the server-generated UTC/local snapshots that later field execution will consume.</p><Link className="button" href="/workspace/occurrences">View Occurrences</Link></section>
 </main>
}
