import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { StandaloneWorkAreaManager } from "@/components/StandaloneWorkAreaManager";
import { WorkAreaRowActions } from "@/components/WorkAreaRowActions";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export default async function WorkAreasPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" }
  });
  if (!membership) redirect("/onboarding");

  const canManage = ["ADMIN", "PROPERTY_MANAGER"].includes(membership.role);

  const [properties, areas] = await Promise.all([
    prisma.property.findMany({
      where: {
        organizationId: membership.organizationId,
        status: "ACTIVE"
      },
      orderBy: { name: "asc" }
    }),
    prisma.workArea.findMany({
      where: {
        property: { organizationId: membership.organizationId }
      },
      include: {
        property: true,
        qrCodes: {
          where: { status: "ACTIVE" },
          orderBy: { generatedAt: "desc" },
          take: 1
        }
      },
      orderBy: { name: "asc" }
    })
  ]);

  return (
    <>
      <Nav />
      <main className="container">
        <div className="row">
          <div style={{ marginRight: "auto" }}>
            <h1>Work Areas</h1>
            <p className="muted">
              Parent Property is always shown. Service Status shows the current
              QR, last service, next service and recent compliance history.
            </p>
          </div>
          {canManage ? (
            <StandaloneWorkAreaManager properties={properties} />
          ) : null}
        </div>

        <div className="card" style={{ overflowX: "auto" }}>
          <table className="table">
            <thead>
              <tr>
                <th>Work Area</th>
                <th>Parent Property</th>
                <th>Location</th>
                <th>Status</th>
                <th>Service Status</th>
                <th>Public QR</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {areas.map((wa) => {
                const qr = wa.qrCodes[0];
                return (
                  <tr key={wa.id}>
                    <td><strong>{wa.name}</strong></td>
                    <td>{wa.property.name}</td>
                    <td>{wa.locationIdentifier || "—"}</td>
                    <td>{wa.status}</td>
                    <td>
                      <Link href={`/work-areas/${wa.id}/service-status`}>
                        View
                      </Link>
                    </td>
                    <td>
                      {qr ? (
                        <Link href={`/qr/${qr.id}`} target="_blank">
                          Open
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {canManage ? (
                        <div className="row compact">
                          <WorkAreaRowActions workArea={wa} />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {!areas.length ? (
                <tr>
                  <td colSpan={7} className="muted">No Work Areas yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
