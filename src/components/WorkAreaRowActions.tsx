"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PRODUCT_NAME, QR_SCAN_PROMPT } from "@/lib/productBrand";

type QrView = {
  workAreaName: string;
  propertyName: string;
  organizationName: string;
  dataUrl: string;
};

export function WorkAreaRowActions({ workArea, organizationName }: { workArea: any; organizationName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [qr, setQr] = useState<QrView | null>(null);
  const [busy, setBusy] = useState(false);

  const propertyName = workArea.property?.name ?? "Property";

  async function patch(payload: any) {
    setError("");
    setBusy(true);
    try {
      const r = await fetch(`/api/work-areas/${workArea.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Unable to update Work Area");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to update Work Area");
    } finally {
      setBusy(false);
    }
  }

  async function qrAction(action: "reprint" | "regenerate") {
    setError("");
    setBusy(true);
    try {
      const r = await fetch(
        `/api/work-areas/${workArea.id}/qr/${action}`,
        { method: "POST" }
      );
      const d = await r.json();
      if (!r.ok) {
        throw new Error(d.error || `Unable to ${action} QR code`);
      }

      setQr({
        workAreaName: workArea.name,
        propertyName,
        organizationName,
        dataUrl: d.qr.dataUrl
      });
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : `Unable to ${action} QR code`
      );
    } finally {
      setBusy(false);
    }
  }

  function printQr() {
    if (!qr) return;
    const w = window.open("", "_blank", "width=520,height=760");
    if (!w) return;
    const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(qr.workAreaName)} QR Label</title><style>
      @page{size:4in 6in;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;width:4in;height:6in;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif}.label{width:4in;height:6in;padding:.20in .22in .18in;display:flex;flex-direction:column;align-items:center;text-align:center;overflow:hidden}.product{font-size:28pt;font-weight:900;line-height:1.05;margin:0 0 .08in}.org{font-size:17pt;font-weight:800;line-height:1.12;max-height:.55in;overflow:hidden}.property{font-size:15pt;font-weight:700;line-height:1.12;margin-top:.06in;max-height:.48in;overflow:hidden}.area{font-size:18pt;font-weight:900;line-height:1.1;margin-top:.08in;max-height:.62in;overflow:hidden}.qr{width:2.75in;height:2.75in;object-fit:contain;margin:auto 0 .06in}.scan{font-size:16pt;font-weight:900;line-height:1.15;margin:.04in 0 0}@media print{button{display:none}}
    </style></head><body><div class="label"><div class="product">${esc(PRODUCT_NAME)}</div><div class="org">${esc(qr.organizationName)}</div><div class="property">${esc(qr.propertyName)}</div><div class="area">${esc(qr.workAreaName)}</div><img class="qr" src="${qr.dataUrl}" alt="QR"><div class="scan">${esc(QR_SCAN_PROMPT)}</div></div><script>window.onload=()=>setTimeout(()=>window.print(),250)</script></body></html>`);
    w.document.close();
    w.focus();
  }

  return (
    <>
      <button
        className="button small secondary"
        onClick={() => setEditing(true)}
        disabled={busy}
      >
        View / Edit
      </button>

      <button
        className="button small secondary"
        onClick={() =>
          patch({
            status:
              workArea.status === "ACTIVE" ? "INACTIVE" : "ACTIVE"
          })
        }
        disabled={busy}
      >
        {workArea.status === "ACTIVE" ? "Inactivate" : "Reactivate"}
      </button>

      {workArea.status === "ACTIVE" ? (
        <>
          <button
            className="button small secondary"
            onClick={() => qrAction("reprint")}
            disabled={busy}
          >
            View / Reprint QR
          </button>

          <button
            className="button small danger"
            onClick={() => qrAction("regenerate")}
            disabled={busy}
          >
            Regenerate QR
          </button>
        </>
      ) : null}

      {error ? <span className="error">{error}</span> : null}

      {editing ? (
        <div className="modalBackdrop">
          <div className="modal">
            <h2>View / Edit Work Area</h2>
            <p>
              <strong>Parent Property:</strong> {propertyName}
            </p>

            <form
              action={(fd) =>
                patch({
                  name: String(fd.get("name") || ""),
                  description: String(fd.get("description") || ""),
                  locationIdentifier: String(
                    fd.get("locationIdentifier") || ""
                  )
                })
              }
            >
              <label>
                Name
                <input name="name" defaultValue={workArea.name} />
              </label>

              <label>
                Description
                <textarea
                  name="description"
                  defaultValue={workArea.description || ""}
                />
              </label>

              <label>
                Exact Location Identifier
                <input
                  name="locationIdentifier"
                  defaultValue={workArea.locationIdentifier || ""}
                />
              </label>

              {error ? <p className="error">{error}</p> : null}

              <div className="row">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEditing(false)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button className="button" disabled={busy}>
                  {busy ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {qr ? (
        <div className="modalBackdrop">
          <div className="modal qrModal">
            <h2>{qr.workAreaName}</h2>
            <p className="muted">Property: {qr.propertyName}</p>
            <img
              className="qrImage"
              src={qr.dataUrl}
              alt={`QR for ${qr.workAreaName}`}
            />
            <p className="muted">The printed label contains no internal QR ID.</p>
            <strong>{QR_SCAN_PROMPT}</strong>

            <div className="row">
              <button
                className="button secondary"
                onClick={() => setQr(null)}
              >
                Close
              </button>
              <button className="button" onClick={printQr}>
                Print 4 × 6 Label
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
