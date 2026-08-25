import Link from "next/link";
export function Nav(){return <nav className="nav"><Link className="brand" href="/dashboard">eDekhbhal</Link><Link href="/properties">Properties</Link><Link href="/audit">Audit Trail</Link><Link href="/subscription">Subscription</Link></nav>}
