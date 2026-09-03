import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireAuthenticatedUser } from "@/lib/auth/server-session";
import { getOnboardingSnapshot, onboardingPath } from "@/lib/onboarding/server";
import { getWorkArea } from "@/lib/work-areas/server";

type Props = { params: Promise<{ id: string }> };

export default async function WorkAreaQrPage({ params }: Props) {
  const user = await requireAuthenticatedUser();
  const snapshot = await getOnboardingSnapshot(user.id);
  if (!snapshot || snapshot.onboarding_state !== "ONBOARDING_COMPLETE") {
    redirect(onboardingPath(snapshot?.onboarding_state ?? "REGISTERED"));
  }
  if (!snapshot.app_user_id || !snapshot.organization_id || !snapshot.membership_id) redirect("/workspace");

  const { id } = await params;
  const area = await getWorkArea({
    userId: snapshot.app_user_id,
    organizationId: snapshot.organization_id,
    membershipId: snapshot.membership_id,
  }, id);
  if (!area?.public_token) notFound();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const publicUrl = `${proto}://${host}/q/${area.public_token}`;
  const svg = await QRCode.toString(publicUrl, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: 640,
  });

  return (
    <main className="labelPage">
      <div className="labelToolbar noPrint">
        <Link className="button secondaryButton" href="/workspace/work-areas">Back</Link>
        <span className="button">Browser: Ctrl/Cmd + P</span>
      </div>
      <section className="qrLabel">
        <div className="qrBrand">Operations Platform</div>
        <div>{snapshot.organization_name}</div>
        <div>{area.site_name}</div>
        <h1>{area.name}</h1>
        <div className="qrSvg" dangerouslySetInnerHTML={{ __html: svg }} />
        <strong>Scan for Service Information</strong>
      </section>
      <p className="noPrint labelHint">Choose Print in your browser. Reprinting this page preserves the same active QR identity.</p>
    </main>
  );
}
