import { getRuntimeSql, withTenantContext, type TenantRuntimeContext } from "@/db/runtime";

export type WorkAreaRow = {
  id: string;
  site_id: string;
  site_name: string;
  name: string;
  code: string;
  description: string | null;
  location_details: string | null;
  status: "ACTIVE" | "INACTIVE";
  version: number;
  qr_id: string | null;
  public_token: string | null;
};

export async function listWorkAreas(context: TenantRuntimeContext) {
  return withTenantContext(context, async (tx) => {
    return tx<WorkAreaRow[]>`
      select
        w.id, w.site_id, s.name as site_name, w.name, w.code,
        w.description, w.location_details, w.status, w.version,
        q.id as qr_id, q.public_token
      from work_area w
      join site s on s.id = w.site_id
      left join work_area_qr q on q.work_area_id = w.id and q.status = 'ACTIVE'
      order by s.name, w.name
    `;
  });
}

export async function getWorkArea(context: TenantRuntimeContext, id: string) {
  const rows = await withTenantContext(context, async (tx) => {
    return tx<WorkAreaRow[]>`
      select
        w.id, w.site_id, s.name as site_name, w.name, w.code,
        w.description, w.location_details, w.status, w.version,
        q.id as qr_id, q.public_token
      from work_area w
      join site s on s.id = w.site_id
      left join work_area_qr q on q.work_area_id = w.id and q.status = 'ACTIVE'
      where w.id = ${id}
      limit 1
    `;
  });
  return rows[0] ?? null;
}

export async function resolvePublicQr(token: string) {
  const sql = getRuntimeSql();
  const rows = await sql<{
    organization_name: string;
    site_name: string;
    work_area_name: string;
    work_area_description: string | null;
    location_details: string | null;
    service_status: "ACTIVE" | "INACTIVE";
  }[]>`select * from app_private.resolve_public_work_area_qr(${token})`;
  return rows[0] ?? null;
}
