import QRCode from "qrcode";
import { randomToken, sha256 } from "./security";

export function makeQrToken() {
  const raw = randomToken(32);
  return { raw, hash: sha256(raw), preview: raw.slice(0, 10) + "…" };
}
export async function renderQrDataUrl(rawToken: string) {
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/qr/${encodeURIComponent(rawToken)}`;
  return QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 512 });
}
