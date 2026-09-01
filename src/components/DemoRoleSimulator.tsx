"use client";

import { useRouter } from "next/navigation";
import type { DemoRole } from "@/lib/demoWorkspace";

const labels: Record<DemoRole, string> = {
  ADMIN: "Admin",
  PROPERTY_MANAGER: "Property Manager",
  USER: "User",
};

const descriptions: Record<DemoRole, string> = {
  ADMIN: "Organization-wide management perspective",
  PROPERTY_MANAGER: "Assigned-Property management perspective",
  USER: "Field-user / read-only perspective",
};

export function DemoRoleSimulator({ initialRole }: { initialRole: DemoRole }) {
  const router = useRouter();

  function choose(next: DemoRole) {
    document.cookie = `demo-view-as=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.localStorage.setItem("demo-view-as", next);
    router.refresh();
  }

  return (
    <div className="demoRoleBlock">
      <div className="demoRoleSimulator" aria-label="Demo role simulator">
        <span>View as</span>
        {(Object.keys(labels) as DemoRole[]).map((item) => (
          <button
            key={item}
            type="button"
            className={initialRole === item ? "active" : ""}
            onClick={() => choose(item)}
            title="Demo perspective only — your real account permissions do not change."
          >
            {labels[item]}
          </button>
        ))}
      </div>
      <small>{descriptions[initialRole]}</small>
    </div>
  );
}
