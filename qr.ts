import QRCode from "qrcode";
import { randomToken, sha256 } from "./security";

export function makeQrSeed() {
  const raw = randomToken(32);
  return { hash: sha256(raw), preview: raw.slice(0, 10) + "…" };
}

export async function renderQrDataUrl(qrPublicId: string) {
  const url = `${process.env.APP_URL ?? "http://localhost:3000"}/qr/${encodeURIComponent(qrPublicId)}`;
  return QRCode.toDataURL(url, { errorCorrectionLevel: "M", margin: 2, width: 512 });
}
