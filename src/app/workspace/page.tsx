import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/server-session";
import { signOut } from "@/lib/auth/actions";
import { getOnboardingSnapshot, onboardingPath } from "@/lib/onboarding/server";

export default async function WorkspacePage() {
  const user = await requireAuthenticatedUser();
  const snapshot = await getOnboardingSnapshot(user.id);

  if (!snapshot || snapshot.onboarding_state !== "ONBOARDING_COMPLETE") {
    redirect(onboardingPath(snapshot?.onboarding_state ?? "REGISTERED"));
  }

  return (
    <main className="workspacePage">
      <header className="workspaceHeader">
        <div>
          <span className="eyebrow">ORGANIZATION WORKSPACE</span>
          <h1>{snapshot.organization_name}</h1>
          <p>{snapshot.site_name} · {snapshot.plan_code}</p>
        </div>
        <form action={signOut}><button className="button secondaryButton" type="submit">Sign out</button></form>
      </header>
      <section className="workspaceGrid">
        <article className="metricCard"><span>Role</span><strong>{snapshot.role_code}</strong><p>Organization-scoped authorization is active.</p></article>
        <article className="metricCard"><span>Site</span><strong>{snapshot.site_name}</strong><p>Your first Site is ready for Work Areas.</p></article>
        <article className="metricCard"><span>Plan</span><strong>{snapshot.plan_code}</strong><p>Provider-neutral entitlement is active.</p></article>
      </section>
      <section className="workspacePanel">
        <span className="eyebrow">NEXT MODULE</span>
        <h2>Site → Work Areas → QR identity</h2>
        <p>The workspace shell is now authenticated, tenant-aware, and ready for the first operational hierarchy.</p>
      </section>
    </main>
  );
}
