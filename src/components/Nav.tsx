import Link from "next/link";
export function Nav() {
  return (
    <header className="nav">
      <Link className="brand" href="/dashboard">eDekhbhal</Link>
      <nav>
        <Link href="/properties">Properties</Link>
        <Link href="/audit">Audit Trail</Link>
        <Link href="/subscription">Subscription</Link>
      </nav>
    </header>
  );
}
