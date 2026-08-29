import { createClient } from "@supabase/supabase-js";
import { EVIDENCE_BUCKET } from "./supabaseStorage";

export const PERSONNEL_BUCKET = process.env.PERSONNEL_BUCKET ?? EVIDENCE_BUCKET;

function client() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Personnel storage is not configured.");
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

export async function createPersonnelSignedUpload(path: string) {
  const { data, error } = await client().storage.from(PERSONNEL_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(error?.message ?? "Unable to create personnel upload URL.");
  return { bucket: PERSONNEL_BUCKET, path: data.path, token: data.token, signedUrl: data.signedUrl };
}

export async function createPersonnelSignedDownload(path: string, expiresInSeconds = 900) {
  const { data, error } = await client().storage.from(PERSONNEL_BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) throw new Error(error?.message ?? "Unable to create personnel download URL.");
  return data.signedUrl;
}

export async function personnelObjectExists(path: string) {
  const { data, error } = await client().storage.from(PERSONNEL_BUCKET).exists(path);
  if (error) throw new Error(error.message);
  return Boolean(data);
}

export async function getPersonnelObjectInfo(path: string) {
  const { data, error } = await client().storage.from(PERSONNEL_BUCKET).info(path);
  if (error || !data) throw new Error(error?.message ?? "Unable to inspect personnel upload.");
  if (typeof data.size !== "number" || !Number.isFinite(data.size) || data.size <= 0) {
    throw new Error("Unable to determine a valid personnel file size.");
  }
  return { size: data.size, contentType: data.contentType ?? null };
}
