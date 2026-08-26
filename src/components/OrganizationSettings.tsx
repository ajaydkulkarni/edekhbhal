"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Organization = {
  id: string;
  name: string;
  logoUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLine3: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string;
};

export function OrganizationSettings({ organization, canEdit }: { organization: Organization; canEdit: boolean }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(organization.logoUrl || "");

  async function submit(formData: FormData) {
    setSaving(true);
    setError("");
    try {
      let logoUrl = preview;
      const logo = formData.get("logo") as File | null;
      if (logo && logo.size > 0) {
        if (!logo.type.startsWith("image/")) throw new Error("Organization logo must be an image file.");
        if (logo.size > 1024 * 1024) throw new Error("Organization logo must be 1 MB or smaller for this staging build.");
        logoUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Unable to read the logo file."));
          reader.readAsDataURL(logo);
        });
        setPreview(logoUrl);
      }

      const payload = {
        logoUrl,
        addressLine1: String(formData.get("addressLine1") || ""),
        addressLine2: String(formData.get("addressLine2") || ""),
        addressLine3: String(formData.get("addressLine3") || ""),
        city: String(formData.get("city") || ""),
        state: String(formData.get("state") || ""),
        postalCode: String(formData.get("postalCode") || ""),
        country: String(formData.get("country") || ""),
        timezone: String(formData.get("timezone") || "UTC"),
      };

      const r = await fetch("/api/organizations/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to update organization");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update organization");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form action={submit}>
      <label>
        Organization Name
        <input value={organization.name} disabled />
        <span className="helpText">Organization name is permanent and cannot be changed after creation.</span>
      </label>

      {preview && <img className="logoPreview" src={preview} alt="Organization logo preview" />}
      <label>
        Organization Logo
        <input type="file" name="logo" accept="image/*" disabled={!canEdit} />
      </label>

      <div className="formGrid">
        <label>Address Line 1<input name="addressLine1" defaultValue={organization.addressLine1 || ""} disabled={!canEdit} /></label>
        <label>Address Line 2<input name="addressLine2" defaultValue={organization.addressLine2 || ""} disabled={!canEdit} /></label>
        <label>Address Line 3<input name="addressLine3" defaultValue={organization.addressLine3 || ""} disabled={!canEdit} /></label>
        <label>City<input name="city" defaultValue={organization.city || ""} disabled={!canEdit} /></label>
        <label>State<input name="state" defaultValue={organization.state || ""} disabled={!canEdit} /></label>
        <label>ZIP / PIN<input name="postalCode" defaultValue={organization.postalCode || ""} disabled={!canEdit} /></label>
        <label>Country<input name="country" defaultValue={organization.country || ""} disabled={!canEdit} /></label>
        <label>Time Zone<input name="timezone" defaultValue={organization.timezone} disabled={!canEdit} /></label>
      </div>

      {error && <p className="error">{error}</p>}
      {canEdit && <button className="button" disabled={saving}>{saving ? "Saving..." : "Save Organization"}</button>}
    </form>
  );
}
