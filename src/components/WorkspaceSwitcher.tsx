"use client";

import { useRouter } from "next/navigation";
import { DEMO_WORKSPACE } from "@/lib/demoWorkspace";

export function WorkspaceSwitcher({
  realOrganizationName,
  current,
}: {
  realOrganizationName: string;
  current: "REAL" | "DEMO";
}) {
  const router = useRouter();

  return (
    <label className="workspaceSwitcher">
      <span className="srOnly">Workspace</span>
      <select
        aria-label="Workspace"
        value={current}
        onChange={(event) => {
          router.push(event.target.value === "DEMO" ? "/demo/dashboard" : "/dashboard");
        }}
      >
        <option value="REAL">{realOrganizationName}</option>
        <option value="DEMO">{DEMO_WORKSPACE.displayName}</option>
      </select>
    </label>
  );
}
