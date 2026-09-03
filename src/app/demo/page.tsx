import Link from "next/link";
import { brand } from "@/lib/brand";

const demoSteps = [
  ["1", "User details", "A synthetic user profile demonstrates audit attribution."],
  ["2", "Organization", "Creates a fictional Organization without touching tenant data."],
  ["3", "Plan", "Shows Free Beta activation and explains paid-provider behavior."],
  ["4", "First Site", "Creates a synthetic Site and previews the workspace handoff."],
];

const demoTasks = [
  {
    name: "Clean main entrance glass",
    preview: "Clean both sides with approved cleaner. Check edges and corners before completion.",
    status: "ACTIVE",
  },
  {
    name: "Restock lobby supplies",
    preview: "Confirm tissue, sanitizer, and visitor supplies are above the minimum operating level.",
    status: "ACTIVE",
  },
  {
    name: "Legacy seasonal display check",
    preview: "Inactive masters remain available for history but are not intended for new Schedule composition.",
    status: "INACTIVE",
  },
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

        <section className="demoOperations">
          <span className="eyebrow">TASK MASTER DEMO</span>
          <h2>Reusable Organization-level Tasks</h2>
          <p className="muted">
            Tasks remain independent of Site and Work Area until a later Schedule composes them.
            USER is read-only; permitted management roles maintain the reusable master.
          </p>
          <div className="demoTaskGrid">
            {demoTasks.map((task) => (
              <article className="demoTaskCard" key={task.name}>
                <span className={`statusPill ${task.status === "ACTIVE" ? "activePill" : "inactivePill"}`}>{task.status}</span>
                <h3>{task.name}</h3>
                <p>{task.preview}</p>
                <small>Attachment metadata → private object storage; no Base64 media.</small>
              </article>
            ))}
          </div>
          <div className="demoBehaviorGrid">
            <article><strong>Create / edit</strong><span>Meaningful changes are versioned and audited with old/new values.</span></article>
            <article><strong>Soft lifecycle</strong><span>Inactive Tasks remain historical masters instead of being deleted.</span></article>
            <article><strong>Schedule-ready</strong><span>A later Schedule increment will snapshot Task instructions for execution history.</span></article>
          </div>
        </section>

        <div className="demoBanner">
          <strong>Demo safety boundary</strong>
          <span>Real authentication, tenant writes, Task changes, QR regeneration, billing, evidence capture, and destructive actions are unavailable here.</span>
        </div>
        <Link className="button" href="/">Back to landing page</Link>
      </div>
    </main>
  );
}
