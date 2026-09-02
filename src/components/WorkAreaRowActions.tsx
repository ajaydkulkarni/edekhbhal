"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type QrView = {
  workAreaName: string;
  propertyName: string;
  qrId: string;
  dataUrl: string;
};

export function WorkAreaRowActions({ workArea }: { workArea: any }) {
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
        qrId: d.qr.id,
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

    const w = window.open("", "_blank", "width=700,height=800");
    if (!w) return;

    const safeWorkArea = qr.workAreaName.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const safeProperty = qr.propertyName.replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const safeId = qr.qrId.replaceAll("<", "&lt;").replaceAll(">", "&gt;");

    w.document.write(`
      <html>
        <head>
          <title>${safeWorkArea} QR</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 40px;
            }
            img {
              width: 420px;
              height: 420px;
            }
            .id {
              font-family: monospace;
              color: #555;
            }
          </style>
        </head>
        <body>
          <h1>eDekhbhal</h1>
          <h2>${safeWorkArea}</h2>
          <p>Property: ${safeProperty}</p>
          <img src="${qr.dataUrl}" />
          <p class="id">QR ID: ${safeId}</p>
        </body>
      </html>
    `);

    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
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
            <p className="mono">QR ID: {qr.qrId}</p>

            <div className="row">
              <button
                className="button secondary"
                onClick={() => setQr(null)}
              >
                Close
              </button>
              <button className="button" onClick={printQr}>
                Print QR
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
