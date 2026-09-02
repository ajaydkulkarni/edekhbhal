import Link from "next/link";
import { brand } from "@/lib/brand";

const industries = ["Hospitality", "Manufacturing", "Healthcare", "Offices", "Maintenance"];

const steps = [
  ["1", "Organize", "Structure operations as Organization → Site → Work Area."],
  ["2", "Plan", "Create reusable tasks and schedules with timing, evidence and document control."],
  ["3", "Execute", "Users follow My Work or scan a nearby Work Area QR to find eligible work."],
  ["4", "Verify", "Capture evidence, timing, notes and a consistent end-to-end audit trail."],
];

export default function Home() {
  return (
    <main>
      <header className="nav shell">
        <Link className="brand" href="/" aria-label="Home">
          <span className="brandMark">O</span>
          <span>{brand.productName}</span>
        </Link>
        <nav className="navLinks" aria-label="Primary navigation">
          <a href="#how">How it works</a>
          <a href="#industries">Industries</a>
          <a href="#security">Security</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <div className="navActions">
          <Link className="textButton" href="/demo">View Demo</Link>
          <Link className="textButton" href="/login">Sign in</Link>
          <Link className="button small" href="/register">Start free</Link>
        </div>
      </header>

      <section className="hero shell">
        <div className="heroCopy">
          <div className="eyebrow">OPERATIONS, WITHOUT THE CHAOS</div>
          <h1>Every task. Every Site. <span>Verified.</span></h1>
          <p className="heroLead">
            Plan recurring work, let teams execute where they are, capture proof,
            and see what is actually happening—without forcing operations into a rigid route.
          </p>
          <div className="heroActions">
            <Link className="button" href="/register">Start free</Link>
            <Link className="button secondary" href="/demo">Explore the demo</Link>
          </div>
          <div className="trustLine">
            <span>✓ Open or assigned work</span>
            <span>✓ QR-first execution</span>
            <span>✓ Complete auditability</span>
          </div>
        </div>

        <div className="heroVisual" aria-label="Illustration of live operations">
          <div className="floating card cardA">
            <div className="miniLabel">LIVE OPERATIONS</div>
            <strong>18 due now</strong>
            <div className="bar"><i style={{ width: "72%" }} /></div>
            <small>12 complete · 4 in progress · 2 open</small>
          </div>
          <div className="phone">
            <div className="phoneTop" />
            <div className="phoneContent">
              <span className="miniLabel">MY WORK</span>
              <h3>Sanitation Checklist</h3>
              <p>Packaging Line 2</p>
              <div className="status">Open · Due 8:15 AM</div>
              <div className="qr">
                <div className="qrGrid">▦</div>
              </div>
              <button type="button">Claim &amp; Start</button>
            </div>
          </div>
          <div className="floating card cardB">
            <div className="miniLabel">AUDIT</div>
            <strong>Reassigned</strong>
            <small>Ravi Patel → Priya Shah</small>
            <small className="muted">User · IP · Old · New</small>
          </div>
          <div className="orbit orbit1" />
          <div className="orbit orbit2" />
        </div>
      </section>

      <section className="proofStrip" id="industries">
        <div className="shell proofInner">
          <span>Built for operational work across</span>
          {industries.map((industry) => <strong key={industry}>{industry}</strong>)}
        </div>
      </section>

      <section className="section shell" id="how">
        <div className="sectionHeading">
          <div className="eyebrow">ONE SIMPLE OPERATING MODEL</div>
          <h2>From plan to proof, without losing the human flexibility.</h2>
          <p>The next job can be recommended. It does not have to dictate the worker&apos;s physical route.</p>
        </div>
        <div className="steps">
          {steps.map(([n, title, copy]) => (
            <article className="step" key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section tinted" id="security">
        <div className="shell split">
          <div>
            <div className="eyebrow">DESIGNED FOR TRUST</div>
            <h2>Security is part of the data model.</h2>
            <p>
              Tenant isolation, RLS, immutable execution history, explicit Organization context,
              private evidence storage, and uniform audit trails are built into the architecture—not added later.
            </p>
          </div>
          <div className="securityGrid">
            <div><strong>RLS-native</strong><span>Organization isolation at PostgreSQL level</span></div>
            <div><strong>Time-correct</strong><span>UTC execution + local scheduling intent</span></div>
            <div><strong>Auditable</strong><span>Date/Time · User · IP · Old · New</span></div>
            <div><strong>Concurrency-safe</strong><span>Claims and assignments protected in the database</span></div>
          </div>
        </div>
      </section>

      <section className="section shell" id="pricing">
        <div className="cta">
          <div>
            <div className="eyebrow">START SIMPLE. GROW WHEN YOU NEED TO.</div>
            <h2>Local pricing. Flexible plans. No operational lock-in.</h2>
            <p>Free, sponsored, seat-based and feature-based plans are supported by the same entitlement architecture.</p>
          </div>
          <Link className="button light" href="/register">Create your workspace</Link>
        </div>
      </section>

      <footer className="footer shell">
        <span>© 2026 {brand.productName}</span>
        <span>{brand.tagline}</span>
      </footer>
    </main>
  );
}
