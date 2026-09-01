"use client";

import { useEffect, useState } from "react";
import type { DemoRole } from "@/lib/demoWorkspace";

const labels: Record<DemoRole, string> = {
  ADMIN: "Admin",
  PROPERTY_MANAGER: "Property Manager",
  USER: "User",
};

const descriptions: Record<DemoRole, string> = {
  ADMIN: "Organization-wide management perspective",
  PROPERTY_MANAGER: "Assigned-Property management perspective",
  USER: "Field-user/read-only management perspective",
};

export function DemoRoleSimulator() {
  const [role, setRole] = useState<DemoRole>("ADMIN");

  useEffect(() => {
    const saved = window.localStorage.getItem("demo-view-as") as DemoRole | null;
    if (saved && labels[saved]) setRole(saved);
  }, []);

  function choose(next: DemoRole) {
    setRole(next);
    window.localStorage.setItem("demo-view-as", next);
  }

  return (
    <div className="demoRoleBlock">
      <div className="demoRoleSimulator" aria-label="Demo role simulator">
        <span>View as</span>
        {(Object.keys(labels) as DemoRole[]).map((item) => (
          <button
            key={item}
            type="button"
            className={role === item ? "active" : ""}
            onClick={() => choose(item)}
            title="Role simulator only — your real account permissions do not change."
          >
            {labels[item]}
          </button>
        ))}
      </div>
      <small>{descriptions[role]}</small>
    </div>
  );
}
