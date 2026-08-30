import Link from "next/link";

const features = [
  ["Schedule intelligently","One-time and recurring work with reusable or ad-hoc corrective tasks."],
  ["Execute on mobile","Accept, scan, start, capture evidence and complete work with server-authoritative timing."],
  ["Resolve exceptions","Turn reported issues into corrective work without forcing task-master setup."],
  ["Prove the work","Evidence, task timing, variance, public QR service transparency and complete audit history."]
];

export default function LandingPage(){
 return <main className="landing">
  <header className="landingNav">
   <Link href="/" className="landingBrand"><span>eD</span><strong>eDekhbhal</strong></Link>
   <nav aria-label="Landing navigation"><a href="#how-it-works">How it works</a><a href="#features">Features</a><a href="#tour">Product tour</a></nav>
   <div className="landingActions"><Link href="/login" className="landingGhost">Login</Link><Link href="/register" className="landingButton">Get started</Link></div>
  </header>

  <section className="landingHero">
   <div className="heroCopy">
    <span className="landingEyebrow">Operational work, visibly under control</span>
    <h1>Plan it. Execute it. <em>Prove it.</em></h1>
    <p>eDekhbhal connects schedules, work areas, people, mobile execution, evidence, corrective work and audit history in one operational platform.</p>
    <div className="heroActions"><Link href="/register" className="landingButton large">Create your organization</Link><a href="#tour" className="landingGhost large">Watch product tour</a></div>
    <div className="trustLine"><span>✓ Role-based access</span><span>✓ QR-enabled work areas</span><span>✓ Evidence & audit trail</span></div>
   </div>
   <div className="heroVisual" aria-label="eDekhbhal product preview">
    <div className="mockWindow">
     <div className="mockTop"><span></span><span></span><span></span><strong>Operations command center</strong></div>
     <div className="mockGrid">
      <div className="mockStat"><small>Due now</small><strong>12</strong><span>Across 4 properties</span></div>
      <div className="mockStat"><small>In progress</small><strong>7</strong><span>5 team members active</span></div>
      <div className="mockStat"><small>Open issues</small><strong>3</strong><span>Needs attention</span></div>
      <div className="mockWide"><div><small>Attention required</small><strong>Pipe leaking — Wash Area</strong><span>Reported 8 minutes ago</span></div><span className="mockAction">Create work</span></div>
      <div className="mockWide teal"><div><small>Latest completed service</small><strong>Conference Room Service</strong><span>6 tasks · completed 11:42 AM</span></div><b>+4%</b></div>
     </div>
    </div>
   </div>
  </section>

  <section id="how-it-works" className="landingSection">
   <span className="landingEyebrow">How it works</span><h2>One continuous operating loop</h2>
   <div className="workflow">
    {["Plan","Assign","Execute","Evidence","Resolve"].map((s,i)=><div key={s}><b>{String(i+1).padStart(2,"0")}</b><strong>{s}</strong><span>{["Create reusable or ad-hoc work","Give the right people the right property access","Run work from mobile with real timestamps","Capture photos, video and completion detail","Turn issues into corrective schedules"][i]}</span></div>)}
   </div>
  </section>

  <section id="tour" className="landingSection tourSection">
   <div><span className="landingEyebrow">Explainer video</span><h2>See eDekhbhal in under a minute</h2><p>The tour covers planned work, mobile execution, ad-hoc corrective tasks, public QR transparency and auditability.</p></div>
   <video className="productTour" controls preload="metadata" playsInline><source src="/edekhbhal-product-tour.mp4" type="video/mp4"/>Your browser does not support HTML video.</video>
  </section>

  <section id="features" className="landingSection">
   <span className="landingEyebrow">Built for real operations</span><h2>Flexible where operations are unpredictable. Controlled where they matter.</h2>
   <div className="featureGrid">{features.map(([title,body])=><article key={title}><span>✓</span><h3>{title}</h3><p>{body}</p></article>)}</div>
  </section>

  <section className="subscriptionReady">
   <div><span className="landingEyebrow">Commercially flexible</span><h2>Ready for feature-based, usage-based or user-count subscriptions.</h2><p>Billing comes later. Entitlements and limits are designed into the product foundation now, so plans can evolve without rewriting business logic.</p></div>
   <div className="entitlementCards"><span>Feature access</span><span>User limits</span><span>Property limits</span><span>Usage limits</span></div>
  </section>

  <section className="landingCta"><h2>Ready to put operational work under control?</h2><p>Start with an organization and configure your first property, work area and schedule.</p><div><Link href="/register" className="landingButton large">Register</Link><Link href="/login" className="landingGhost large">Login</Link></div></section>
  <footer className="landingFooter"><strong>eDekhbhal</strong><span>Plan · Execute · Prove · Improve</span><div><Link href="/login">Login</Link><Link href="/register">Register</Link></div></footer>
 </main>;
}
