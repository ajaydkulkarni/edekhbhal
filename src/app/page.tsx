import Link from "next/link";
export default function Home() {
  return <main className="container"><div className="card" style={{ maxWidth: 720, margin: "70px auto", textAlign: "center" }}>
    <h1>eDekhbhal</h1><p className="muted">Multi-tenant property, work-area and QR management.</p>
    <div className="row" style={{ justifyContent: "center" }}><Link className="button" href="/register">Register</Link><Link className="button secondary" href="/login">Login</Link></div>
  </div></main>;
}
