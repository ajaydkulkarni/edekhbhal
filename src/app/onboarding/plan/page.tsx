import { activateFreeBeta } from "@/lib/onboarding/actions";
import { requireAuthenticatedUser } from "@/lib/auth/server-session";
import { getOnboardingSnapshot } from "@/lib/onboarding/server";

export default async function PlanOnboardingPage() {
  const user = await requireAuthenticatedUser();
  const snapshot = await getOnboardingSnapshot(user.id);

  if (!snapshot?.organization_id) {
    return (
      <main className="simplePage"><div className="authCard">
        <h1>Create your Organization first.</h1>
        <a className="button" href="/onboarding/organization">Continue</a>
      </div></main>
    );
  }

  return (
    <main className="simplePage">
      <div className="onboardingWide">
        <div className="stepRow"><strong>3</strong><span>Select plan</span></div>
        <h1>Choose how to activate {snapshot.organization_name}.</h1>
        <p className="muted">Commercial entitlement is provider-neutral. Stripe payment activation comes in the billing adapter increment.</p>
        <div className="planGrid">
          <article className="planCard featuredPlan">
            <span className="eyebrow">AVAILABLE NOW</span>
            <h2>Free Beta</h2>
            <p>$0 during the foundation beta.</p>
            <ul><li>Full onboarding</li><li>Core web workspace</li><li>Initial Site</li></ul>
            <form action={activateFreeBeta}>
              <button className="button" type="submit">Activate Free Beta</button>
            </form>
          </article>
          <article className="planCard">
            <span className="eyebrow">STRIPE READY</span>
            <h2>Standard</h2>
            <p>$49/month reference price.</p>
            <button className="button secondaryButton" disabled>Payment adapter next</button>
          </article>
          <article className="planCard">
            <span className="eyebrow">STRIPE READY</span>
            <h2>Professional</h2>
            <p>$99/month reference price.</p>
            <button className="button secondaryButton" disabled>Payment adapter next</button>
          </article>
        </div>
      </div>
    </main>
  );
}
