import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {withTenantContext} from "@/db/runtime";
import {getAuthenticatedUser} from "@/lib/auth/server-session";
import {getOnboardingSnapshot} from "@/lib/onboarding/server";
import {createClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";

const variantSchema=z.enum(["BEST","ORIGINAL","NORMALIZED","PREVIEW"]);

export async function GET(
 request:NextRequest,
 {params}:{params:Promise<{id:string}>}
){
 const user=await getAuthenticatedUser();
 if(!user)return NextResponse.redirect(new URL("/login?message=Please%20sign%20in%20to%20continue.",request.url));

 const snapshot=await getOnboardingSnapshot(user.id);
 if(!snapshot?.app_user_id||!snapshot.organization_id||!snapshot.membership_id){
  return NextResponse.redirect(new URL("/workspace",request.url));
 }

 const {id}=await params;
 const evidenceId=z.string().uuid().parse(id);
 const variant=variantSchema.catch("BEST").parse((request.nextUrl.searchParams.get("variant")??"BEST").toUpperCase());
 const context={userId:snapshot.app_user_id,organizationId:snapshot.organization_id,membershipId:snapshot.membership_id};

 try{
  const rows=await withTenantContext(context,tx=>tx<{
   result_storage_bucket:string;
   result_object_key:string;
   result_variant:string;
   result_expires_seconds:number|string;
  }[]>`select * from app_private.authorize_occurrence_evidence_read(${evidenceId},${variant})`);
  const auth=rows[0];
  if(!auth)throw new Error("Evidence read was not authorized.");

  const expiresSeconds=Math.min(60,Number(auth.result_expires_seconds));
  const supabase=await createClient();
  const signed=await supabase.storage
   .from(auth.result_storage_bucket)
   .createSignedUrl(auth.result_object_key,expiresSeconds);

  if(signed.error||!signed.data?.signedUrl){
   throw new Error(`Private Evidence read could not be signed. ${signed.error?.message??""}`.trim());
  }

  await withTenantContext(context,tx=>tx`
   select app_private.audit_evidence_read_url_issued(
    ${evidenceId},${auth.result_object_key},${auth.result_variant},'WEB'
   )
  `);

  const response=NextResponse.redirect(signed.data.signedUrl,302);
  response.headers.set("Cache-Control","private, no-store, max-age=0");
  response.headers.set("Referrer-Policy","no-referrer");
  return response;
 }catch(e){
  const message=encodeURIComponent(e instanceof Error?e.message:"Evidence read was blocked.");
  return NextResponse.redirect(new URL(`/workspace/occurrences?evidenceError=${message}`,request.url));
 }
}
