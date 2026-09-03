import { createOrganization } from "@/lib/onboarding/actions";
import { requireAuthenticatedUser } from "@/lib/auth/server-session";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function OrganizationOnboardingPage({ searchParams }: Props) {
  await requireAuthenticatedUser();
  const params = await searchParams;

  return (
    <main className="simplePage">
      <div className="authCard">
        <div className="stepRow"><strong>2</strong><span>Create Organization</span></div>
        <h1>Create your operating Organization.</h1>
        <p className="muted">Organization name becomes immutable after creation.</p>
        {params.error ? <div className="formNotice errorNotice">{params.error}</div> : null}
        <form action={createOrganization} className="formStack">
          <label>Organization name<input name="name" required /></label>
          <div className="formGrid">
            <label>Country code<input name="countryCode" defaultValue="US" maxLength={2} required /></label>
            <label>Currency<input name="currencyCode" defaultValue="USD" maxLength={3} required /></label>
          </div>
          <label>
            Default timezone
            <input name="timezone" defaultValue="America/Denver" required />
          </label>
          <button className="button" type="submit">Create Organization</button>
        </form>
      </div>
    </main>
  );
}
