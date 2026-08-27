"use client";

import { useState } from "react";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <button type="button" className="navLogout" onClick={logout} disabled={busy}>
      {busy ? "Logging out…" : "Logout"}
    </button>
  );
}
