import Link from "next/link";
import { brand } from "@/lib/brand";

const demoSteps = [
  ["1", "User details", "A synthetic user profile demonstrates audit attribution."],
  ["2", "Organization", "Creates a fictional Organization without touching tenant data."],
  ["3", "Plan", "Shows Free Beta activation and explains paid-provider behavior."],
  ["4", "First Site", "Creates a synthetic Site and previews the workspace handoff."],
];

export default function DemoPage() {
  return (
    <main className="simplePage">
      <div className="onboardingWide">
        <span className="eyebrow">BEST PRACTICE DEMO</span>
        <h1>Explore {brand.productName} onboarding</h1>
        <p className="muted">
          This is a read-only educational simulation. It does not create an account,
          Organization, subscription, or Site.
        </p>
        <div className="demoSteps">
          {demoSteps.map(([number, title, description]) => (
            <article className="demoStep" key={number}>
              <strong>{number}</strong>
              <div><h2>{title}</h2><p>{description}</p></div>
            </article>
          ))}
        </div>
        <div className="demoBanner">
          <strong>Demo safety boundary</strong>
          <span>Real authentication, billing writes, evidence capture, and destructive actions are intentionally unavailable.</span>
        </div>
        <Link className="button" href="/">Back to landing page</Link>
      </div>
    </main>
  );
}
