import { withTenantContext, type TenantRuntimeContext } from "@/db/runtime";

export type TaskRow = {
  id: string;
  name: string;
  instructions_html: string;
  instructions_preview: string;
  status: "ACTIVE" | "INACTIVE";
  version: number;
  attachment_count: number;
};

function plainTextFromHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function listTasks(context: TenantRuntimeContext) {
  const rows = await withTenantContext(context, (tx) => tx<{
    id: string;
    name: string;
    instructions_html: string;
    status: "ACTIVE" | "INACTIVE";
    version: number;
    attachment_count: number | string;
  }[]>`
    select
      t.id,
      t.name,
      t.instructions_html,
      t.status,
      t.version,
      count(a.id) as attachment_count
    from task_master t
    left join task_attachment a on a.task_id = t.id
    group by t.id
    order by
      case when t.status = 'ACTIVE' then 0 else 1 end,
      lower(t.name),
      t.id
  `);

  return rows.map((row) => ({
    ...row,
    attachment_count: Number(row.attachment_count),
    instructions_preview: plainTextFromHtml(row.instructions_html).slice(0, 240),
  })) satisfies TaskRow[];
}

export async function canManageTasks(context: TenantRuntimeContext) {
  const rows = await withTenantContext(context, (tx) => tx<{ allowed: boolean }[]>`
    select app_private.can_manage_tasks() as allowed
  `);
  return rows[0]?.allowed === true;
}
