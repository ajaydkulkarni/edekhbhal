import fs from "node:fs";
import {describe,expect,it} from "vitest";

describe("Occurrence ambiguity hotfix contract",()=>{
 const migration=fs.readFileSync("drizzle/0011_occurrence_id_ambiguity_hotfix.sql","utf8");
 it("uses a distinct PL/pgSQL variable and a qualified child-table predicate",()=>{
  expect(migration).toContain("v_occurrence_id uuid");
  expect(migration).toContain("returning id into v_occurrence_id");
  expect(migration).toContain("public.schedule_occurrence_task.occurrence_id=v_occurrence_id");
  expect(migration).not.toMatch(/occurrence_id\s*=\s*occurrence_id/i);
 });
});
