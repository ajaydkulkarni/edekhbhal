import Link from "next/link";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { isDemoDataEnabled } from "@/lib/demoDataAccess";
import { LogoutButton } from "@/components/LogoutButton";

export async function Nav() {
  const user = await getSessionUser();
  const membership = user
    ? await prisma.organizationMember.findFirst({
        where: { userId: user.id, status: "ACTIVE" },
        include: { organization: true },
      })
    : null;

  const initials = membership?.organization.name?.slice(0, 2).toUpperCase() ?? "ED";

  return (
    <header className="nav">
      <Link className="brand" href="/dashboard">eDekhbhal</Link>
      <nav>
        <Link href="/properties">Properties</Link>
        <Link href="/work-areas">Work Areas</Link><Link href="/tasks">Tasks</Link><Link href="/schedules">Schedules</Link>
        <Link href="/team">Team</Link>
        <Link href="/organization">Organization</Link>
        <Link href="/audit">Audit Trail</Link>
        <Link href="/subscription">Subscription</Link>
        {membership?.role === "ADMIN" && isDemoDataEnabled() && <Link href="/admin/demo-data">Demo Data</Link>}
      </nav>
      <div className="navAccount">
        <Link className="orgBadge" href="/profile" title="My Profile">
          {membership?.organization.logoUrl ? (
            <img src={membership.organization.logoUrl} alt={`${membership.organization.name} logo`} />
          ) : (
            <span className="logoPlaceholder">{initials}</span>
          )}
          <span className="profileLabel">{user?.name || user?.email || "Profile"}</span>
        </Link>
        {user && <LogoutButton />}
      </div>
    </header>
  );
}
