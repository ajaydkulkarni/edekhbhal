import { notFound } from "next/navigation";
import { resolvePublicQr } from "@/lib/work-areas/server";

type Props = { params: Promise<{ token: string }> };

export default async function PublicWorkAreaPage({ params }: Props) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) notFound();

  const area = await resolvePublicQr(token);
  if (!area) notFound();

  return (
    <main className="simplePage">
      <div className="publicServiceCard">
        <span className="eyebrow">SERVICE INFORMATION</span>
        <div className={`statusPill ${area.service_status === "ACTIVE" ? "activePill" : "inactivePill"}`}>
          {area.service_status}
        </div>
        <h1>{area.work_area_name}</h1>
        <p className="publicHierarchy">{area.organization_name} · {area.site_name}</p>
        {area.work_area_description ? <p>{area.work_area_description}</p> : null}
        {area.location_details ? <div className="publicDetail"><strong>Location</strong><span>{area.location_details}</span></div> : null}
        <div className="demoBanner">
          <strong>Public transparency</strong>
          <span>This page intentionally excludes worker contact details, private notes, audit history, and private evidence.</span>
        </div>
      </div>
    </main>
  );
}
