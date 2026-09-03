import Link from "next/link";
import { signUpWithPassword } from "@/lib/auth/actions";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function RegisterPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main className="simplePage">
      <div className="authCard">
        <span className="eyebrow">START FREE</span>
        <h1>Create your account.</h1>
        <p className="muted">
          After verification, guided onboarding takes you through your profile,
          Organization, plan activation, and first Site.
        </p>

        {params.error ? <div className="formNotice errorNotice">{params.error}</div> : null}

        <form action={signUpWithPassword} className="formStack">
          <label>
            Work email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button className="button" type="submit">Create account</button>
        </form>

        <p className="formFooter">
          Already registered? <Link href="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
