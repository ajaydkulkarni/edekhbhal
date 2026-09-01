"use client";

import { useRouter } from "next/navigation";
import { DEMO_WORKSPACE } from "@/lib/demoWorkspace";

export function WorkspaceSwitcher({
  realOrganizationName,
  current,
}: {
  realOrganizationName?: string | null;
  current: "REAL" | "DEMO";
}) {
  const router = useRouter();
  const hasRealOrganization = Boolean(realOrganizationName);

  return (
    <label className="workspaceSwitcher">
      <span className="srOnly">Workspace</span>
      <select
        aria-label="Workspace"
        value={current}
        onChange={(event) => {
          if (event.target.value === "DEMO") {
            router.push("/demo/dashboard");
          } else {
            router.push(hasRealOrganization ? "/dashboard" : "/onboarding");
          }
        }}
      >
        <option value="REAL">{realOrganizationName || "Create Organization"}</option>
        <option value="DEMO">{DEMO_WORKSPACE.displayName}</option>
      </select>
    </label>
  );
}
