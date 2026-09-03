import Link from "next/link";
import { sendMagicLink, signInWithPassword } from "@/lib/auth/actions";

type Props = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main className="simplePage">
      <div className="authCard">
        <span className="eyebrow">SIGN IN</span>
        <h1>Welcome back.</h1>
        <p className="muted">Use your password or request a secure magic link.</p>

        {params.error ? <div className="formNotice errorNotice">{params.error}</div> : null}
        {params.message ? <div className="formNotice successNotice">{params.message}</div> : null}

        <form action={signInWithPassword} className="formStack">
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="button" type="submit">Sign in</button>
        </form>

        <div className="formDivider"><span>or</span></div>

        <form action={sendMagicLink} className="formStack">
          <label>
            Email for magic link
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <button className="button secondaryButton" type="submit">Send magic link</button>
        </form>

        <p className="formFooter">
          New here? <Link href="/register">Create an account</Link>
        </p>
      </div>
    </main>
  );
}
