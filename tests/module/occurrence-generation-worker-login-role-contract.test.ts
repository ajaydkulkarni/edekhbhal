import fs from "node:fs";
import {
  describe,
  expect,
  it
} from "vitest";

const sql=
  fs.readFileSync(
    "supabase-privileged/004_occurrence_worker_login_role.sql",
    "utf8"
  );


describe(
  "Occurrence Generation Worker 04A LOGIN role contract",
  ()=>{

    it(
      "creates a dedicated LOGIN identity with safe role attributes",
      ()=>{

        expect(sql).toMatch(
          /create role vnext_occurrence_worker_login[\s\S]*login/i
        );

        expect(sql).toMatch(
          /inherit/i
        );

        expect(sql).toMatch(
          /nosuperuser/i
        );

        expect(sql).toMatch(
          /nocreatedb/i
        );

        expect(sql).toMatch(
          /nocreaterole/i
        );

        expect(sql).toMatch(
          /noreplication/i
        );

        expect(sql).toMatch(
          /nobypassrls/i
        );

        const createRoleClause =
          sql.match(
            /create role vnext_occurrence_worker_login[\\s\\S]*?;/i
          )?.[0] ?? "";

        expect(createRoleClause).not.toMatch(
          /(^|\\s)bypassrls(?=\\s|;|$)/i
        );

        expect(sql).toMatch(
          /connection limit 3/i
        );
      }
    );


    it(
      "creates the LOGIN without a repository password secret",
      ()=>{

        expect(sql).toMatch(
          /password null/i
        );

        expect(sql).not.toMatch(
          /password\s+'[^']+'/i
        );

        expect(sql).not.toMatch(
          /password\s+"[^"]+"/i
        );

        expect(sql).not.toMatch(
          /service[_-]?role/i
        );
      }
    );


    it(
      "inherits only the Occurrence worker capability role",
      ()=>{

        expect(sql).toMatch(
          /grant vnext_occurrence_worker[\s\S]*to vnext_occurrence_worker_login/i
        );

        expect(sql).toMatch(
          /revoke vnext_runtime[\s\S]*from vnext_occurrence_worker_login/i
        );

        expect(sql).toMatch(
          /revoke vnext_evidence_worker[\s\S]*from vnext_occurrence_worker_login/i
        );

        expect(sql).toContain(
          "occurrence_capability_member"
        );

        expect(sql).toContain(
          "runtime_member"
        );

        expect(sql).toContain(
          "evidence_worker_member"
        );
      }
    );


    it(
      "does not grant direct function or table privileges",
      ()=>{

        expect(sql).not.toMatch(
          /grant execute/i
        );

        expect(sql).not.toMatch(
          /grant\s+(select|insert|update|delete)\b/i
        );
      }
    );


    it(
      "fails closed if the capability role is absent or LOGIN attributes drift",
      ()=>{

        expect(sql).toContain(
          "vnext_occurrence_worker capability role must exist"
        );

        expect(sql).toContain(
          "vnext_occurrence_worker_login has unsafe role attributes"
        );
      }
    );

  }
);
