import Link from "next/link";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createWorkArea, regenerateQr, toggleWorkAreaStatus } from "@/lib/work-areas/actions";
import { listWorkAreas } from "@/lib/work-areas/server";
import { requireAuthenticatedUser } from "@/lib/auth/server-session";
import { getOnboardingSnapshot, onboardingPath } from "@/lib/onboarding/server";
import { withTenantContext } from "@/db/runtime";

type Props = { searchParams: Promise<{ error?: string; message?: string }> };

export default async function WorkAreasPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const snapshot = await getOnboardingSnapshot(user.id);
  if (!snapshot || snapshot.onboarding_state !== "ONBOARDING_COMPLETE") {
    redirect(onboardingPath(snapshot?.onboarding_state ?? "REGISTERED"));
  }
  if (!snapshot.app_user_id || !snapshot.organization_id || !snapshot.membership_id) redirect("/workspace");

  const context = {
    userId: snapshot.app_user_id,
    organizationId: snapshot.organization_id,
    membershipId: snapshot.membership_id,
  };
  const [areas, sites] = await Promise.all([
    listWorkAreas(context),
    withTenantContext(context, (tx) => tx<{ id: string; name: string }[]>`
      select id, name from site where status = 'ACTIVE' order by name
    `),
  ]);
  const params = await searchParams;

  return (
    <main className="workspacePage">
      <header className="workspaceHeader">
        <div>
          <span className="eyebrow">SITE OPERATIONS</span>
          <h1>Work Areas</h1>
          <p>{snapshot.organization_name} · {areas.length} Work Area{areas.length === 1 ? "" : "s"}</p>
        </div>
        <Link className="button secondaryButton" href="/workspace">Workspace</Link>
      </header>

      {params.error ? <div className="formNotice errorNotice workspaceNotice">{params.error}</div> : null}
      {params.message ? <div className="formNotice successNotice workspaceNotice">{params.message}</div> : null}

      {snapshot.role_code === "ADMIN" || snapshot.role_code === "SITE_MANAGER" ? (
        <section className="workspacePanel">
          <span className="eyebrow">NEW WORK AREA</span>
          <h2>Add an operational area</h2>
          <form action={createWorkArea} className="formStack">
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <label>
              Site
              <select name="siteId" required>
                {sites.map((site) => <option value={site.id} key={site.id}>{site.name}</option>)}
              </select>
            </label>
            <div className="formGrid">
              <label>Name<input name="name" placeholder="Lobby" required /></label>
              <label>Code<input name="code" placeholder="LOBBY" required /></label>
            </div>
            <label>Description<textarea name="description" rows={3} /></label>
            <label>Location details<textarea name="locationDetails" rows={2} placeholder="Ground floor, north entrance" /></label>
            <button className="button" type="submit">Create Work Area + QR</button>
          </form>
        </section>
      ) : null}

      <section className="workAreaGrid">
        {areas.length === 0 ? (
          <article className="workspacePanel"><h2>No Work Areas yet</h2><p>Create the first Work Area to establish its active QR identity.</p></article>
        ) : areas.map((area) => (
          <article className="workAreaCard" key={area.id}>
            <div className="workAreaCardHead">
              <div>
                <span className={`statusPill ${area.status === "ACTIVE" ? "activePill" : "inactivePill"}`}>{area.status}</span>
                <h2>{area.name}</h2>
                <p>{area.site_name} · {area.code}</p>
              </div>
              <Link className="button secondaryButton" href={`/workspace/work-areas/${area.id}/qr`}>QR label</Link>
            </div>
            <p>{area.description || "No description."}</p>
            {area.location_details ? <small>{area.location_details}</small> : null}
            <div className="cardActions">
              <form action={toggleWorkAreaStatus}>
                <input type="hidden" name="workAreaId" value={area.id} />
                <input type="hidden" name="version" value={area.version} />
                <input type="hidden" name="currentStatus" value={area.status} />
                <button className="button secondaryButton" type="submit">
                  {area.status === "ACTIVE" ? "Make inactive" : "Reactivate"}
                </button>
              </form>
              <form action={regenerateQr}>
                <input type="hidden" name="workAreaId" value={area.id} />
                <input type="hidden" name="idempotencyKey" value={randomUUID()} />
                <button className="button dangerButton" type="submit" disabled={area.status !== "ACTIVE"}>
                  Regenerate QR
                </button>
              </form>
            </div>
            <small className="muted">Reprint keeps the same QR. Regenerate invalidates the old QR.</small>
          </article>
        ))}
      </section>
    </main>
  );
}
