import Link from "next/link";

export default function LoginPage() {
  return (
    <main className="simplePage">
      <div className="simpleCard">
        <span className="eyebrow">SIGN IN</span>
        <h1>Welcome back.</h1>
        <p>Supabase Auth will be connected after the new vNext Supabase project is created.</p>
        <Link className="button" href="/">Back</Link>
      </div>
    </main>
  );
}
