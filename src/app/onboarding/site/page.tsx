import { createFirstSite } from "@/lib/onboarding/actions";
import { requireAuthenticatedUser } from "@/lib/auth/server-session";
import { getOnboardingSnapshot } from "@/lib/onboarding/server";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function SiteOnboardingPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const snapshot = await getOnboardingSnapshot(user.id);
  const params = await searchParams;

  return (
    <main className="simplePage">
      <div className="authCard">
        <div className="stepRow"><strong>4</strong><span>Create first Site</span></div>
        <h1>Add your first Site.</h1>
        <p className="muted">Onboarding ends here. Work Areas will be created inside the Site in the next operational module.</p>
        {params.error ? <div className="formNotice errorNotice">{params.error}</div> : null}
        <form action={createFirstSite} className="formStack">
          <label>Site name<input name="name" required /></label>
          <div className="formGrid">
            <label>Site code<input name="code" placeholder="SLC01" required /></label>
            <label>Country code<input name="countryCode" defaultValue="US" maxLength={2} required /></label>
          </div>
          <label>Timezone<input name="timezone" defaultValue="America/Denver" required /></label>
          <label>Address<input name="addressLine1" /></label>
          <div className="formGrid">
            <label>City<input name="city" /></label>
            <label>State / Region<input name="region" /></label>
          </div>
          <label>Postal code<input name="postalCode" /></label>
          <button className="button" type="submit">Create Site & open workspace</button>
        </form>
        <small className="muted">Organization: {snapshot?.organization_name ?? "Not available"}</small>
      </div>
    </main>
  );
}
