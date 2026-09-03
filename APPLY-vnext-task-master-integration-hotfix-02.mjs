import fs from "node:fs";
import { execSync } from "node:child_process";

const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();
if (branch !== "vNext") throw new Error(`Expected vNext branch, got ${branch}`);

const file = "tests/integration/task-master-foundation.test.ts";
if (!fs.existsSync(file)) throw new Error(`${file} is missing.`);

let s = fs.readFileSync(file, "utf8");

const versionBefore = `    expect(rows[0]).toMatchObject({
      name: "Clean entrance glass",
      instructions_html: "<p>Clean <strong>both sides</strong>.</p>",
      status: "ACTIVE",
      version: 1,
    });`;

const versionAfter = `    expect(rows[0]).toMatchObject({
      name: "Clean entrance glass",
      instructions_html: "<p>Clean <strong>both sides</strong>.</p>",
      status: "ACTIVE",
    });
    expect(Number(rows[0].version)).toBe(1);`;

if (s.includes(versionBefore)) {
  s = s.replace(versionBefore, versionAfter);
} else if (!s.includes(versionAfter)) {
  throw new Error("Could not locate bigint-version assertion anchor.");
}

const rlsBefore = `    await expect(asUser((tx) => tx\`
      update task_master set name='Forbidden' where id=\${ids.task}
    \`)).rejects.toThrow();`;

const rlsAfter = `    const userUpdate = await asUser((tx) => tx\`
      update task_master
      set name='Forbidden'
      where id=\${ids.task}
      returning id
    \`);
    expect(userUpdate).toHaveLength(0);

    const unchanged = await asAdmin((tx) => tx<{ name: string }[]>\`
      select name from task_master where id=\${ids.task}
    \`);
    expect(unchanged[0].name).toBe("Clean entrance glass");`;

if (s.includes(rlsBefore)) {
  s = s.replace(rlsBefore, rlsAfter);
} else if (!s.includes(rlsAfter)) {
  throw new Error("Could not locate USER RLS assertion anchor.");
}

fs.writeFileSync(file, s, "utf8");

execSync(`npx eslint "${file}"`, { stdio: "inherit" });
console.log("Task Master integration expectation hotfix applied; ESLint passed.");
console.log("Run: npx vitest run tests/integration/task-master-foundation.test.ts");
