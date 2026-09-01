import "../../demo/demo-workspace.css";
import QRCode from "qrcode";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DEMO_WORKSPACE, findDemoWorkArea, getDemoReport } from "@/lib/demoWorkspace";

export default async function DemoQrPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const found = findDemoWorkArea(id);
  if (!found) notFound();

  const baseUrl = (process.env.APP_URL || "https://edekhbhal.vercel.app").replace(/\/$/, "");
  const publicUrl = `${baseUrl}/demo-qr/${encodeURIComponent(id)}`;
  const qr = await QRCode.toDataURL(publicUrl, { width: 300, margin: 2 });
  const report = getDemoReport(7);
  const recent = report.exceptions.filter((e) => e.propertyId === found.property.id).slice(0, 5);

  return (
    <div className="demoPublicTheme">
      <div className="demoBanner">{DEMO_WORKSPACE.banner}</div>
      <div className="demoPublicHeader">
        <strong>{DEMO_WORKSPACE.displayName}</strong>
        <Link href="/login">eDekhbhal Login</Link>
      </div>
      <main className="container demoPage">
        <section className="demoQrHero">
          <div>
            <span className="eyebrow">Public demo Work Area status</span>
            <h1>{found.workArea.name}</h1>
            <p><strong>{found.property.name}</strong> · {found.property.industry}</p>
            <p>{found.workArea.description}</p>
            <div className="demoReadOnlyBadge">Demo only — mobile execution disabled</div>
          </div>
          <div className="demoQrCard">
            <img src={qr} alt={`Demo QR for ${found.workArea.name}`} />
            <small>{publicUrl}</small>
          </div>
        </section>
        <section className="demoPanel">
          <h2>Recent synthetic service exceptions</h2>
          {recent.length ? (
            <ul className="demoPrinciples">
              {recent.map((e) => <li key={e.id}><strong>{e.dateKey}</strong> — {e.scheduleName}: {e.exception}</li>)}
            </ul>
          ) : <p>No exception sampled for this Property in the current seven-day window.</p>}
        </section>
      </main>
    </div>
  );
}
