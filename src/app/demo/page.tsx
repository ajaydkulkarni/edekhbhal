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
        <h1>Explore {brand.productName}</h1>
        <p className="muted">This is a read-only educational simulation. It never creates tenant data.</p>

        <div className="demoSteps">
          {demoSteps.map(([number, title, description]) => (
            <article className="demoStep" key={number}>
              <strong>{number}</strong>
              <div><h2>{title}</h2><p>{description}</p></div>
            </article>
          ))}
        </div>

        <section className="demoOperations">
          <span className="eyebrow">WORK AREA + QR DEMO</span>
          <div className="demoWorkAreaCard">
            <div>
              <span className="statusPill activePill">ACTIVE</span>
              <h2>Main Lobby</h2>
              <p>Downtown Site · LOBBY</p>
            </div>
            <div className="demoQrPattern" aria-label="Synthetic QR illustration" />
          </div>
          <div className="demoBehaviorGrid">
            <article><strong>Reprint</strong><span>Uses the same active QR identity.</span></article>
            <article><strong>Regenerate</strong><span>Revokes the old QR and issues a new random public token.</span></article>
            <article><strong>Public scan</strong><span>Shows safe service information only. A QR never grants authorization.</span></article>
          </div>
        </section>

        <div className="demoBanner">
          <strong>Demo safety boundary</strong>
          <span>Real authentication, tenant writes, QR regeneration, billing, evidence capture, and destructive actions are unavailable here.</span>
        </div>
        <Link className="button" href="/">Back to landing page</Link>
      </div>
    </main>
  );
}
