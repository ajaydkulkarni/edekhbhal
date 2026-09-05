"use client";

import {
 useRef,
 useState,
} from "react";
import {
 useRouter,
} from "next/navigation";
import {
 createClient,
} from "@/lib/supabase/client";
import {
 createMobileEvidenceUploadIntent,
 finalizeMobileEvidenceUpload,
} from "@/lib/work-execution/actions";

type Props={
 taskId:string;
 taskVersion:number;
 evidenceType:"PHOTO"|"VIDEO";
};

const maxBytes={
 PHOTO:20*1024*1024,
 VIDEO:200*1024*1024,
};

const accepts={
 PHOTO:"image/jpeg,image/png,image/webp",
 VIDEO:"video/mp4,video/webm,video/quicktime",
};

async function sha256Hex(
 file:File
){
 const data=
  await file.arrayBuffer();

 const digest=
  await crypto.subtle.digest(
   "SHA-256",
   data
  );

 return Array
  .from(
   new Uint8Array(digest)
  )
  .map(
   value=>
    value
     .toString(16)
     .padStart(2,"0")
  )
  .join("");
}

export function MobileEvidenceCapture({
 taskId,
 taskVersion,
 evidenceType,
}:Props){
 const router=useRouter();

 const inputRef=
  useRef<HTMLInputElement|null>(null);

 const [file,setFile]=
  useState<File|null>(null);

 const [busy,setBusy]=
  useState(false);

 const [message,setMessage]=
  useState<string|null>(null);

 const [error,setError]=
  useState<string|null>(null);

 async function upload(){
  if(!file){
   return;
  }

  setBusy(true);
  setError(null);
  setMessage(null);

  try{
   if(
    file.size<1
    || file.size>maxBytes[evidenceType]
   ){
    throw new Error(
     `${evidenceType} file exceeds the allowed size.`
    );
   }

   if(
    !accepts[evidenceType]
     .split(",")
     .includes(file.type)
   ){
    throw new Error(
     `${file.type||"Unknown file type"} is not allowed for ${evidenceType} evidence.`
    );
   }

   const intent=
    await createMobileEvidenceUploadIntent({
     occurrenceTaskId:taskId,
     expectedTaskVersion:taskVersion,
     evidenceType,
     originalFilename:file.name,
     contentType:file.type,
     byteSize:file.size,
     idempotencyKey:crypto.randomUUID(),
    });

   const supabase=
    createClient();

   // Preserve the certified ordinary authenticated Storage INSERT.
   // Storage RLS evaluates the short-lived server-owned Evidence intent
   // at the actual object upload boundary.
   const uploaded=
    await supabase.storage
     .from(intent.storageBucket)
     .upload(
      intent.objectKey,
      file,
      {
       contentType:file.type,
       upsert:false,
      }
     );

   if(uploaded.error){
    throw new Error(
     `Evidence upload blocked: ${uploaded.error.message}`
    );
   }

   const checksum=
    await sha256Hex(file);

   await finalizeMobileEvidenceUpload({
    evidenceId:intent.evidenceId,
    expectedVersion:intent.version,
    sha256Hex:checksum,
    idempotencyKey:crypto.randomUUID(),
   });

   setFile(null);

   if(inputRef.current){
    inputRef.current.value="";
   }

   setMessage(
    "Evidence uploaded. Verification is pending; Task completion remains blocked until VERIFIED."
   );

   router.refresh();
  }catch(errorValue){
   setError(
    errorValue instanceof Error
     ?errorValue.message
     :"Evidence upload failed."
   );
  }finally{
   setBusy(false);
  }
 }

 return(
  <div className="mobileEvidenceCapture">
   <div>
    <strong>
     {evidenceType}
     {" evidence capture"}
    </strong>

    <p className="muted">
     Capture with the device camera/camcorder or choose
     an existing file. The private object path is allocated
     by the server and checked again by Storage RLS.
    </p>
   </div>

   <input
    ref={inputRef}
    type="file"
    accept={accepts[evidenceType]}
    capture="environment"
    disabled={busy}
    onChange={
     event=>{
      setFile(
       event.target.files?.[0]
       ??null
      );

      setMessage(null);
      setError(null);
     }
    }
   />

   {file?
    <div className="mobileEvidenceSelection">
     <span>Selected</span>

     <strong>
      {file.name}
     </strong>

     <small>
      {Math.ceil(
       file.size/1024
      )}
      {" KB"}
     </small>
    </div>
    :null}

   <button
    className="button mobilePrimaryButton"
    type="button"
    disabled={busy||!file}
    onClick={
     ()=>{
      void upload();
     }
    }
   >
    {busy
     ?"Uploading Evidence…"
     :`Upload ${evidenceType}`}
   </button>

   <small className="muted">
    {evidenceType==="PHOTO"
     ?"JPEG / PNG / WebP · max 20 MB"
     :"MP4 / WebM / QuickTime · max 200 MB"}
   </small>

   {message?
    <div
     className="mobileEvidenceUploadMessage"
     aria-live="polite"
    >
     <strong>
      {message}
     </strong>

     <button
      className="button secondaryButton"
      type="button"
      onClick={
       ()=>{
        router.refresh();
       }
      }
     >
      Refresh Verification Status
     </button>
    </div>
    :null}

   {error?
    <p
     className="mobileQrError"
     role="alert"
    >
     <strong>
      Evidence upload blocked:
     </strong>
     {" "}
     {error}
    </p>
    :null}
  </div>
 );
}
