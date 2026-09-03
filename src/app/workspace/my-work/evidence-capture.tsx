"use client";

import {useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {createEvidenceUploadIntent,finalizeEvidenceUpload} from "@/lib/work-execution/actions";

type Props={
 taskId:string;
 taskVersion:number;
 evidenceType:"PHOTO"|"VIDEO";
};

const maxBytes={PHOTO:20*1024*1024,VIDEO:200*1024*1024};
const accepts={
 PHOTO:"image/jpeg,image/png,image/webp",
 VIDEO:"video/mp4,video/webm,video/quicktime",
};

async function sha256Hex(file:File){
 const data=await file.arrayBuffer();
 const digest=await crypto.subtle.digest("SHA-256",data);
 return Array.from(new Uint8Array(digest)).map(v=>v.toString(16).padStart(2,"0")).join("");
}

export function EvidenceCapture({taskId,taskVersion,evidenceType}:Props){
 const [file,setFile]=useState<File|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState<string|null>(null);
 const [error,setError]=useState<string|null>(null);

 async function upload(){
  if(!file)return;
  setBusy(true);setError(null);setMessage(null);
  try{
   if(file.size<1||file.size>maxBytes[evidenceType]){
    throw new Error(`${evidenceType} file exceeds the allowed size.`);
   }
   if(!accepts[evidenceType].split(",").includes(file.type)){
    throw new Error(`${file.type||"Unknown file type"} is not allowed for ${evidenceType} evidence.`);
   }

   const intent=await createEvidenceUploadIntent({
    occurrenceTaskId:taskId,
    expectedTaskVersion:taskVersion,
    evidenceType,
    originalFilename:file.name,
    contentType:file.type,
    byteSize:file.size,
    idempotencyKey:crypto.randomUUID(),
   });

   const supabase=createClient();

   // Use an authenticated direct INSERT rather than a signed upload token.
   // The Storage RLS INSERT policy is therefore evaluated at the actual upload
   // and enforces the server-owned short-lived Evidence intent at that moment.
   const uploaded=await supabase.storage
    .from(intent.storageBucket)
    .upload(intent.objectKey,file,{
     contentType:file.type,
     upsert:false,
    });

   if(uploaded.error){
    throw new Error(`Evidence upload blocked: ${uploaded.error.message}`);
   }

   const checksum=await sha256Hex(file);
   await finalizeEvidenceUpload({
    evidenceId:intent.evidenceId,
    expectedVersion:intent.version,
    sha256Hex:checksum,
    idempotencyKey:crypto.randomUUID(),
   });

   setFile(null);
   const input=document.getElementById(`evidence-${taskId}`) as HTMLInputElement|null;
   if(input)input.value="";
   setMessage("Evidence uploaded. Verification is pending; Task completion remains blocked until VERIFIED.");
  }catch(e){
   setError(e instanceof Error?e.message:"Evidence upload failed.");
  }finally{
   setBusy(false);
  }
 }

 return <div className="workspacePanel">
  <strong>{evidenceType} evidence capture</strong>
  <p className="muted">
   Private authenticated upload. The server allocates the tenant/Occurrence/Task-scoped object key,
   and Storage re-checks the active short-lived Evidence intent when the upload occurs.
  </p>
  <input
   id={`evidence-${taskId}`}
   type="file"
   accept={accepts[evidenceType]}
   disabled={busy}
   onChange={event=>setFile(event.target.files?.[0]??null)}
  />
  <button className="button" type="button" disabled={busy||!file} onClick={upload}>
   {busy?"Uploading…":`Upload ${evidenceType}`}
  </button>
  <small>
   {evidenceType==="PHOTO"?"JPEG/PNG/WebP · max 20 MB":"MP4/WebM/QuickTime · max 200 MB"}
  </small>
  {message?<p><strong>{message}</strong></p>:null}
  {error?<p><strong>Evidence upload blocked:</strong> {error}</p>:null}
 </div>;
}
