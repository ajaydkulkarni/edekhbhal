import fs from "node:fs";
import {describe,expect,it} from "vitest";

describe("Working-hours validator privilege hotfix contract",()=>{
 it("grants only runtime CHECK-constraint execution and keeps PUBLIC revoked",()=>{
  const sql=fs.readFileSync("drizzle/0012_working_hours_validator_privilege_hotfix.sql","utf8");
  expect(sql).toMatch(/revoke all on function app_private\.is_valid_working_hours_json\(jsonb\)[\s\S]*from public, anon, authenticated/i);
  expect(sql).toMatch(/grant execute on function app_private\.is_valid_working_hours_json\(jsonb\)[\s\S]*to vnext_runtime/i);
 });
});
