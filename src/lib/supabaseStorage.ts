import { createClient } from "@supabase/supabase-js";

export const EVIDENCE_BUCKET = process.env.EVIDENCE_BUCKET ?? "execution-evidence";

function client() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Evidence storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel."
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function createEvidenceSignedUpload(path: string) {
  const { data, error } = await client()
    .storage
    .from(EVIDENCE_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) throw new Error(error?.message ?? "Unable to create evidence upload URL.");
  return {
    bucket: EVIDENCE_BUCKET,
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl
  };
}

export async function createEvidenceSignedDownload(path: string, expiresInSeconds = 900) {
  const { data, error } = await client()
    .storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(error?.message ?? "Unable to create evidence download URL.");
  return data.signedUrl;
}


export async function evidenceObjectExists(path: string) {
  const { data, error } = await client()
    .storage
    .from(EVIDENCE_BUCKET)
    .exists(path);
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function getEvidenceObjectInfo(path: string) {
  const { data, error } = await client()
    .storage
    .from(EVIDENCE_BUCKET)
    .info(path);
  if (error || !data) throw new Error(error?.message ?? "Unable to inspect evidence upload.");
  return {
    size: data.size,
    contentType: data.contentType ?? null
  };
}
