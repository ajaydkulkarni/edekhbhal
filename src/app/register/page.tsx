import Link from "next/link";

export default function RegisterPage() {
  return (
    <main className="simplePage">
      <div className="simpleCard">
        <span className="eyebrow">START FREE</span>
        <h1>Create your account.</h1>
        <p>
          Guided onboarding will continue through Profile → Organization → Plan → First Site,
          then release the user into the workspace.
        </p>
        <Link className="button" href="/">Back</Link>
      </div>
    </main>
  );
}
