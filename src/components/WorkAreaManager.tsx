"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type WorkArea = {
  id: string;
  name: string;
  description: string | null;
  locationIdentifier: string | null;
  qrCodes: { id: string; tokenPreview: string; generatedAt: string | Date }[];
};

type Props = { propertyId: string; workAreas: WorkArea[]; canManage: boolean };

export function WorkAreaManager({ propertyId, workAreas, canManage }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [qr, setQr] = useState<{ workAreaName: string; qrId: string; dataUrl: string } | null>(null);

  async function createWorkArea(formData: FormData) {
    setSaving(true); setError("");
    const payload = {
      propertyId,
      name: String(formData.get("name") || ""),
      description: String(formData.get("description") || ""),
      locationIdentifier: String(formData.get("locationIdentifier") || "")
    };
    try {
      const r = await fetch("/api/work-areas", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to create work area");
      setOpen(false);
      setQr({ workAreaName: payload.name, qrId: data.qr.id, dataUrl: data.qr.dataUrl });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create work area");
    } finally { setSaving(false); }
  }

  async function qrAction(workAreaId: string, name: string, action: "reprint" | "regenerate") {
    setError("");
    try {
      const r = await fetch(`/api/work-areas/${workAreaId}/qr/${action}`, { method: "POST" });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Unable to ${action} QR code`);
      setQr({ workAreaName: name, qrId: data.qr.id, dataUrl: data.qr.dataUrl });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Unable to ${action} QR code`);
    }
  }

  function printQr() {
    if (!qr) return;
    const w = window.open("", "_blank", "width=700,height=800");
    if (!w) return;
    w.document.write(`<html><head><title>${qr.workAreaName} QR</title>
      <style>body{font-family:Arial;text-align:center;padding:40px}img{width:420px;height:420px}.id{font-family:monospace;color:#555}</style></head>
      <body><h1>eDekhbhal</h1><h2>${qr.workAreaName}</h2><img src="${qr.dataUrl}" /><p class="id">QR ID: ${qr.qrId}</p></body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  return (
    <>
      <div className="row">
        <h2 style={{ marginRight: "auto" }}>Work Areas</h2>
        {canManage && <button className="button" onClick={() => setOpen(true)}>Add Work Area</button>}
      </div>
      {error && <p className="error">{error}</p>}

      <div className="card">
        <table className="table">
          <thead><tr><th>Name</th><th>Description</th><th>Location</th><th>QR</th><th>Actions</th></tr></thead>
          <tbody>
            {workAreas.map((wa) => {
              const active = wa.qrCodes[0];
              return (
                <tr key={wa.id}>
                  <td><strong>{wa.name}</strong></td>
                  <td>{wa.description || "—"}</td>
                  <td>{wa.locationIdentifier || "—"}</td>
                  <td>{active ? active.tokenPreview : "No active QR"}</td>
                  <td>
                    {canManage && (
                      <div className="row compact">
                        <button className="button small secondary" onClick={() => qrAction(wa.id, wa.name, "reprint")}>Reprint</button>
                        <button className="button small danger" onClick={() => qrAction(wa.id, wa.name, "regenerate")}>Regenerate</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {!workAreas.length && <tr><td colSpan={5} className="muted">No work areas yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && (
        <div className="modalBackdrop">
          <div className="modal">
            <div className="row"><h2 style={{ marginRight: "auto" }}>Add Work Area</h2><button className="button secondary" onClick={() => setOpen(false)}>Close</button></div>
            <form action={createWorkArea}>
              <label>Work Area Name<input name="name" required minLength={2} placeholder="Conference Room A" /></label>
              <label>Description<textarea name="description" rows={3} /></label>
              <label>Exact Location Identifier<input name="locationIdentifier" placeholder="2nd Floor, East Wing, Room 204" /></label>
              {error && <p className="error">{error}</p>}
              <div className="row" style={{ marginTop: 18 }}>
                <button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button className="button" disabled={saving}>{saving ? "Creating..." : "Create Work Area & QR"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {qr && (
        <div className="modalBackdrop">
          <div className="modal qrModal">
            <h2>{qr.workAreaName}</h2>
            <p className="muted">Current active QR code</p>
            <img className="qrImage" src={qr.dataUrl} alt={`QR for ${qr.workAreaName}`} />
            <p className="mono">QR ID: {qr.qrId}</p>
            <div className="row">
              <button className="button secondary" onClick={() => setQr(null)}>Close</button>
              <button className="button" onClick={printQr}>Print QR</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
