import { completeProfile } from "@/lib/onboarding/actions";
import { requireAuthenticatedUser } from "@/lib/auth/server-session";

type Props = { searchParams: Promise<{ error?: string }> };

export default async function ProfileOnboardingPage({ searchParams }: Props) {
  await requireAuthenticatedUser();
  const params = await searchParams;

  return (
    <main className="simplePage">
      <div className="authCard">
        <div className="stepRow"><strong>1</strong><span>User details</span></div>
        <h1>Tell us who you are.</h1>
        <p className="muted">This name is used for audit attribution and workspace collaboration.</p>
        {params.error ? <div className="formNotice errorNotice">{params.error}</div> : null}
        <form action={completeProfile} className="formStack">
          <label>
            Full name
            <input name="displayName" autoComplete="name" required />
          </label>
          <button className="button" type="submit">Continue</button>
        </form>
      </div>
    </main>
  );
}
