import fs from "node:fs";
import { describe, expect, it } from "vitest";

describe("Task Master Foundation contract", () => {
  it("keeps Tasks Organization-level and attachment media out of PostgreSQL", () => {
    const sql = fs.readFileSync("drizzle/0007_task_master_foundation.sql", "utf8");
    const taskStart = sql.indexOf("create table if not exists task_master");
    const taskEnd = sql.indexOf("create index if not exists task_master_org_status_name_idx");
    const taskDefinition = sql.slice(taskStart, taskEnd);

    expect(taskDefinition).toContain("organization_id");
    expect(taskDefinition).not.toContain("site_id");
    expect(taskDefinition).not.toContain("work_area_id");

    const attachmentStart = sql.indexOf("create table if not exists task_attachment");
    const attachmentEnd = sql.indexOf("create index if not exists task_attachment_org_task_idx");
    const attachmentDefinition = sql.slice(attachmentStart, attachmentEnd);
    expect(attachmentDefinition).toContain("storage_key");
    expect(attachmentDefinition).not.toMatch(/base64/i);
  });

  it("keeps Task RLS forced and USER management denied by helper semantics", () => {
    const sql = fs.readFileSync("drizzle/0007_task_master_foundation.sql", "utf8");
    expect(sql).toContain("alter table task_master force row level security");
    expect(sql).toContain("alter table task_attachment force row level security");
    expect(sql).toContain("app_private.current_role() = 'ADMIN'");
    expect(sql).toContain("app_private.current_role() = 'SITE_MANAGER'");
    expect(sql).not.toContain("app_private.current_role() = 'USER'");
  });

  it("keeps Demo parity and the workspace Task route wired", () => {
    const demo = fs.readFileSync("src/app/demo/page.tsx", "utf8");
    const workspace = fs.readFileSync("src/app/workspace/page.tsx", "utf8");
    expect(demo).toContain("TASK MASTER DEMO");
    expect(demo).toContain("no Base64 media");
    expect(workspace).toContain('href="/workspace/tasks"');
  });
});
