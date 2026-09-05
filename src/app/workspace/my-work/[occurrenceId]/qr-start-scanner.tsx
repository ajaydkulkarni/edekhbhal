"use client";

import {
 useCallback,
 useEffect,
 useRef,
 useState,
} from "react";
import {
 startOccurrenceMobile,
} from "@/lib/work-execution/actions";

type Props={
 occurrenceId:string;
 idempotencyKey:string;
};

type BarcodeResult={
 rawValue?:string;
};

type BarcodeDetectorLike={
 detect:(
  source:HTMLVideoElement
 )=>Promise<BarcodeResult[]>;
};

type BarcodeDetectorConstructor={
 new(options?:{
  formats?:string[];
 }):BarcodeDetectorLike;

 getSupportedFormats?:()=>Promise<string[]>;
};

type BarcodeWindow=Window & {
 BarcodeDetector?:BarcodeDetectorConstructor;
};

export function extractQrToken(
 raw:string
){
 const value=raw.trim();

 if(!value){
  return null;
 }

 if(
  /^https?:\/\//i.test(value)
 ){
  try{
   const url=new URL(value);

   const parts=url.pathname
    .split("/")
    .filter(Boolean);

   if(
    parts.length===2
    && parts[0]==="q"
   ){
    const token=decodeURIComponent(
     parts[1]
    ).trim();

    return token||null;
   }

   return null;
  }catch{
   return null;
  }
 }

 return value;
}

export function QrStartScanner({
 occurrenceId,
 idempotencyKey,
}:Props){
 const videoRef=
  useRef<HTMLVideoElement|null>(null);

 const streamRef=
  useRef<MediaStream|null>(null);

 const timerRef=
  useRef<number|null>(null);

 const [token,setToken]=
  useState("");

 const [scanning,setScanning]=
  useState(false);

 const [message,setMessage]=
  useState<string|null>(null);

 const [error,setError]=
  useState<string|null>(null);

 const stopCamera=useCallback(()=>{
  if(timerRef.current!==null){
   window.clearTimeout(
    timerRef.current
   );

   timerRef.current=null;
  }

  if(streamRef.current){
   streamRef.current
    .getTracks()
    .forEach(
     track=>track.stop()
    );

   streamRef.current=null;
  }

  if(videoRef.current){
   videoRef.current.srcObject=null;
  }

  setScanning(false);
 },[]);

 async function scanFrame(
  detector:BarcodeDetectorLike
 ){
   const video=videoRef.current;

   if(
    !video
    || !streamRef.current
   ){
    return;
   }

   try{
    const results=
     await detector.detect(video);

    const raw=
     results.find(
      result=>
       typeof result.rawValue==="string"
       && result.rawValue.trim().length>0
     )?.rawValue;

    if(raw){
     const parsed=
      extractQrToken(raw);

     if(parsed){
      setToken(parsed);

      setMessage(
       "QR captured. Confirm the token and choose Validate QR & Start."
      );

      setError(null);
      stopCamera();

      return;
     }

     setError(
      "The scanned code is not a valid Work Area QR."
     );
    }
   }catch{
    setError(
     "The camera could not read this QR code. You can retry or enter the token manually."
    );

    stopCamera();

    return;
   }

   timerRef.current=
    window.setTimeout(
     ()=>{
      void scanFrame(detector);
     },
     250
    );
 }

 async function startCamera(){
   setError(null);
   setMessage(null);

   if(
    !navigator.mediaDevices
    || !navigator.mediaDevices.getUserMedia
   ){
    setError(
     "Camera access is not available in this browser. Enter the QR token manually."
    );

    return;
   }

   const detectorClass=
    (window as BarcodeWindow)
     .BarcodeDetector;

   if(!detectorClass){
    setError(
     "This browser does not support in-browser QR detection. Enter the QR token manually."
    );

    return;
   }

   try{
    if(
     detectorClass.getSupportedFormats
    ){
     const formats=
      await detectorClass
       .getSupportedFormats();

     if(
      !formats.includes("qr_code")
     ){
      setError(
       "This browser cannot detect QR codes. Enter the QR token manually."
      );

      return;
     }
    }

    const detector=
     new detectorClass({
      formats:["qr_code"],
     });

    const stream=
     await navigator.mediaDevices
      .getUserMedia({
       audio:false,
       video:{
        facingMode:{
         ideal:"environment",
        },
       },
      });

    streamRef.current=stream;

    const video=videoRef.current;

    if(!video){
     stream
      .getTracks()
      .forEach(
       track=>track.stop()
      );

     streamRef.current=null;

     throw new Error(
      "Camera preview is unavailable."
     );
    }

    video.srcObject=stream;

    await video.play();

    setScanning(true);

    void scanFrame(detector);
   }catch(errorValue){
    stopCamera();

    if(
     errorValue instanceof DOMException
     && (
      errorValue.name==="NotAllowedError"
      || errorValue.name==="SecurityError"
     )
    ){
     setError(
      "Camera permission was denied. Enter the QR token manually or allow camera access and retry."
     );

     return;
    }

    setError(
     errorValue instanceof Error
      ?errorValue.message
      :"Camera scanning could not start. Enter the QR token manually."
    );
   }
 }

 useEffect(
  ()=>{
   return ()=>{
    if(timerRef.current!==null){
     window.clearTimeout(
      timerRef.current
     );
    }

    streamRef.current
     ?.getTracks()
     .forEach(
      track=>track.stop()
     );
   };
  },
  []
 );

 return(
  <form
   className="mobileExecutionForm"
   action={startOccurrenceMobile}
  >
   <input
    type="hidden"
    name="occurrenceId"
    value={occurrenceId}
   />

   <input
    type="hidden"
    name="idempotencyKey"
    value={idempotencyKey}
   />

   <div className="mobileQrScanner">
    <div className="mobileQrScannerActions">
     <button
      className="button"
      type="button"
      disabled={scanning}
      onClick={()=>{
       void startCamera();
      }}
     >
      {scanning
       ?"Scanning QR…"
       :"Scan QR with Camera"}
     </button>

     {scanning?
      <button
       className="button secondaryButton"
       type="button"
       onClick={stopCamera}
      >
       Cancel Camera
      </button>
      :null}
    </div>

    <div
     className={
      scanning
       ?"mobileQrVideoWrap active"
       :"mobileQrVideoWrap"
     }
    >
     <video
      ref={videoRef}
      className="mobileQrVideo"
      playsInline
      muted
      aria-label="Work Area QR camera preview"
     />

     {scanning?
      <div
       className="mobileQrTarget"
       aria-hidden="true"
      />
      :null}
    </div>
   </div>

   <label>
    Work Area QR token

    <input
     name="qrToken"
     value={token}
     required
     minLength={8}
     autoCapitalize="none"
     autoCorrect="off"
     spellCheck={false}
     inputMode="text"
     placeholder="Scan or enter active QR token"
     onChange={
      event=>{
       setToken(
        event.target.value
       );

       setMessage(null);
       setError(null);
      }
     }
    />
   </label>

   <p className="muted">
    QR scanning only captures the Work Area token.
    The server still validates your membership,
    Site scope, assignment, active-work rules,
    resource status, and exact active Work Area QR.
   </p>

   {message?
    <p
     className="mobileQrMessage"
     aria-live="polite"
    >
     <strong>{message}</strong>
    </p>
    :null}

   {error?
    <p
     className="mobileQrError"
     role="alert"
    >
     <strong>
      QR scan unavailable:
     </strong>
     {" "}
     {error}
    </p>
    :null}

   <button
    className="button mobilePrimaryButton"
    type="submit"
    disabled={
     token.trim().length<8
     || scanning
    }
   >
    Validate QR & Start
   </button>
  </form>
 );
}
