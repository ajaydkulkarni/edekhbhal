"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ProfileForm({ user }: { user: { email: string; name: string | null } }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(formData: FormData) {
    setSaving(true); setError("");
    try {
      const r = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: String(formData.get("name") || "") }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to update profile");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update profile"); }
    finally { setSaving(false); }
  }
  return <form action={submit}><label>Email<input value={user.email} disabled /></label><label>Name<input name="name" defaultValue={user.name || ""} /></label>{error && <p className="error">{error}</p>}<button className="button" disabled={saving}>{saving ? "Saving..." : "Save Profile"}</button></form>;
}
