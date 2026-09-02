import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const branch = execSync("git branch --show-current", { encoding: "utf8" }).trim();

if (branch !== "vNext") {
  throw new Error(`Refusing to run: expected vNext branch, got ${branch}`);
}

const packagePath = path.join(root, "package.json");
if (!fs.existsSync(packagePath)) {
  throw new Error("package.json not found. Run this from /workspaces/edekhbhal after Foundation 0.");
}

const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

pkg.type = "module";
pkg.devDependencies ??= {};
pkg.devDependencies.typescript = "6.0.3";

// Keep ESLint on the mature 9.x line for the Next/typescript-eslint toolchain.
pkg.devDependencies.eslint = "9.39.2";

fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

const vitestConfig = `import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json", "html"],
    },
  },
});
`;

fs.writeFileSync(path.join(root, "vitest.config.ts"), vitestConfig, "utf8");

console.log("Foundation 0 toolchain hotfix applied.");
console.log("- TypeScript pinned to 6.0.3 for typescript-eslint compatibility");
console.log("- ESLint pinned to mature 9.x line");
console.log("- package.json marked as ESM");
console.log("- Vitest @ alias mapped to ./src");
console.log("");
console.log("Next run: npm install");
