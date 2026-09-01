import { cookies } from "next/headers";
import type { DemoRole } from "@/lib/demoWorkspace";

const VALID_ROLES: DemoRole[] = ["ADMIN", "PROPERTY_MANAGER", "USER"];

export async function getDemoViewRole(): Promise<DemoRole> {
  const store = await cookies();
  const value = store.get("demo-view-as")?.value as DemoRole | undefined;
  return value && VALID_ROLES.includes(value) ? value : "ADMIN";
}
