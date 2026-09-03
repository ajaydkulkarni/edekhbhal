import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Task + Schedule command boundary hardening contract",()=>{
  const sql=fs.readFileSync("drizzle/0009_task_schedule_command_boundary_hardening.sql","utf8");

  it("revokes direct runtime Task/Schedule writes and helper execution",()=>{
    expect(sql).toContain("revoke insert, update on public.task_master from vnext_runtime");
    expect(sql).toContain("revoke insert, update on public.schedule_master from vnext_runtime");
    expect(sql).toContain("revoke insert, update, delete on public.schedule_task from vnext_runtime");
    expect(sql).toContain("revoke execute on function app_private.insert_schedule_tasks");
  });

  it("pins Task mutations to the transaction-local Organization",()=>{
    expect(sql).toContain("where id = p_task_id\n    and organization_id = org_id");
    expect(sql).toContain("and organization_id = org_id\n    and version = p_expected_version");
  });

  it("pins Schedule master and child mutations to the transaction-local Organization",()=>{
    expect(sql).toContain("where id = p_schedule_id\n    and organization_id = org_id");
    expect(sql).toContain("where schedule_id = old_row.id\n    and organization_id = org_id");
    expect(sql).toContain("where id = old_row.id\n    and organization_id = org_id");
  });
});
