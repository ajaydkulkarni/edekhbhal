import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {mkdtemp,readFile,rm,stat,writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const MAX_NORMALIZED_VIDEO_BYTES=200*1024*1024;

export class PermanentMediaError extends Error{
  constructor(message){super(message);this.name="PermanentMediaError";}
}

export function sha256Hex(buffer){
  return createHash("sha256").update(buffer).digest("hex");
}

export function sniffContentType(buffer){
  if(!Buffer.isBuffer(buffer))buffer=Buffer.from(buffer);
  if(buffer.length>=3&&buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff)return "image/jpeg";
  if(buffer.length>=8&&buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])))return "image/png";
  if(buffer.length>=12&&buffer.toString("ascii",0,4)==="RIFF"&&buffer.toString("ascii",8,12)==="WEBP")return "image/webp";
  if(buffer.length>=12&&buffer.toString("ascii",4,8)==="ftyp"){
    const brand=buffer.toString("ascii",8,12);
    return brand==="qt  "?"video/quicktime":"video/mp4";
  }
  if(buffer.length>=4&&buffer[0]===0x1a&&buffer[1]===0x45&&buffer[2]===0xdf&&buffer[3]===0xa3){
    const head=buffer.subarray(0,Math.min(buffer.length,512)).toString("latin1").toLowerCase();
    if(head.includes("webm"))return "video/webm";
  }
  return "application/octet-stream";
}

export function observedSource(buffer){
  const body=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer);
  return {
    contentType:sniffContentType(body),
    byteSize:body.byteLength,
    sha256Hex:sha256Hex(body)
  };
}

export function compareObservedToExpected(observed,{contentType,byteSize,sha256Hex:expectedSha}){
  const expectedType=String(contentType??"").trim().toLowerCase();
  const expectedSize=Number(byteSize);
  const expectedHash=String(expectedSha??"").trim().toLowerCase();
  const mismatches=[];
  if(observed.contentType!==expectedType)mismatches.push(`content-type expected ${expectedType} observed ${observed.contentType}`);
  if(observed.byteSize!==expectedSize)mismatches.push(`byte-size expected ${expectedSize} observed ${observed.byteSize}`);
  if(observed.sha256Hex!==expectedHash)mismatches.push("sha256 mismatch");
  return {matches:mismatches.length===0,mismatches};
}

export function computeRetrySeconds(attemptCount){
  const n=Math.max(1,Number(attemptCount)||1);
  return Math.min(900,15*(2**Math.min(n-1,6)));
}

function runCapture(command,args,{timeoutMs=30_000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{stdio:["ignore","pipe","pipe"]});
    let stdout="",stderr="";
    const timer=setTimeout(()=>{
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    },timeoutMs);
    timer.unref?.();
    child.stdout.on("data",chunk=>{stdout+=chunk.toString();});
    child.stderr.on("data",chunk=>{stderr+=chunk.toString();});
    child.on("error",error=>{
      clearTimeout(timer);
      reject(error);
    });
    child.on("close",code=>{
      clearTimeout(timer);
      if(code===0)resolve({stdout,stderr});
      else reject(new Error(`${command} exited with code ${code}: ${stderr.trim().slice(0,1800)}`));
    });
  });
}

async function inspectPhoto(buffer,expectedMime){
  let metadata;
  try{
    metadata=await sharp(buffer,{failOn:"error"}).metadata();
  }catch(error){
    throw new PermanentMediaError(`PHOTO decode failed: ${error instanceof Error?error.message:String(error)}`);
  }
  const formatMime={
    jpeg:"image/jpeg",
    png:"image/png",
    webp:"image/webp"
  }[metadata.format??""];
  if(!formatMime)throw new PermanentMediaError(`Unsupported PHOTO format: ${metadata.format??"unknown"}`);
  if(formatMime!==expectedMime)
    throw new PermanentMediaError(`PHOTO decoder format ${formatMime} does not match observed MIME ${expectedMime}`);
  if(!metadata.width||!metadata.height)
    throw new PermanentMediaError("PHOTO dimensions could not be determined");
  if((metadata.pages??1)>1)
    throw new PermanentMediaError("Animated/multi-page PHOTO evidence is not supported");
  return metadata;
}

export async function normalizePhoto(buffer,expectedMime){
  await inspectPhoto(buffer,expectedMime);
  const normalized=await sharp(buffer,{failOn:"error"})
    .autoOrient()
    .resize({width:2560,height:2560,fit:"inside",withoutEnlargement:true})
    .webp({quality:82,effort:4})
    .toBuffer();
  const preview=await sharp(buffer,{failOn:"error"})
    .autoOrient()
    .resize({width:640,height:640,fit:"inside",withoutEnlargement:true})
    .webp({quality:72,effort:4})
    .toBuffer();
  if(!normalized.length||!preview.length)throw new PermanentMediaError("PHOTO derivative generation returned an empty object");
  return {
    normalized,
    normalizedContentType:"image/webp",
    preview,
    previewContentType:"image/webp"
  };
}

async function inspectVideoFile(filePath,expectedMime){
  let parsed;
  try{
    const {stdout}=await runCapture("ffprobe",[
      "-v","error",
      "-print_format","json",
      "-show_format",
      "-show_streams",
      filePath
    ],{timeoutMs:45_000});
    parsed=JSON.parse(stdout);
  }catch(error){
    throw new PermanentMediaError(`VIDEO probe failed: ${error instanceof Error?error.message:String(error)}`);
  }
  const video=(parsed.streams??[]).find(stream=>stream.codec_type==="video");
  if(!video)throw new PermanentMediaError("VIDEO evidence contains no video stream");
  const formatName=String(parsed.format?.format_name??"").toLowerCase();
  if(expectedMime==="video/webm"&&!formatName.includes("webm"))
    throw new PermanentMediaError(`VIDEO container ${formatName||"unknown"} does not match WebM`);
  if((expectedMime==="video/mp4"||expectedMime==="video/quicktime")
     && !/(mov|mp4|m4a|3gp|3g2|mj2)/.test(formatName))
    throw new PermanentMediaError(`VIDEO container ${formatName||"unknown"} does not match MP4/QuickTime`);
  const duration=Number(parsed.format?.duration??video.duration??0);
  return {duration:Number.isFinite(duration)&&duration>0?duration:0};
}

export async function normalizeVideo(buffer,expectedMime){
  const dir=await mkdtemp(path.join(os.tmpdir(),"evidence-worker-"));
  const extension=expectedMime==="video/webm"?".webm":expectedMime==="video/quicktime"?".mov":".mp4";
  const source=path.join(dir,`source${extension}`);
  const normalizedPath=path.join(dir,"normalized.mp4");
  const previewPath=path.join(dir,"preview.jpg");
  try{
    await writeFile(source,buffer,{flag:"wx"});
    const info=await inspectVideoFile(source,expectedMime);

    await runCapture("ffmpeg",[
      "-hide_banner","-loglevel","error","-y",
      "-i",source,
      "-map","0:v:0",
      "-map","0:a?",
      "-vf","scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
      "-c:v","libx264",
      "-preset","medium",
      "-crf","23",
      "-pix_fmt","yuv420p",
      "-c:a","aac",
      "-b:a","128k",
      "-movflags","+faststart",
      "-map_metadata","-1",
      "-sn","-dn",
      normalizedPath
    ],{timeoutMs:30*60_000});

    const normalizedStat=await stat(normalizedPath);
    if(normalizedStat.size<1)throw new PermanentMediaError("VIDEO normalization returned an empty object");
    if(normalizedStat.size>MAX_NORMALIZED_VIDEO_BYTES)
      throw new PermanentMediaError("Normalized VIDEO exceeds the 200 MiB private bucket ceiling");

    const seek=info.duration>0?Math.min(1,Math.max(0,info.duration*0.1)):0;
    await runCapture("ffmpeg",[
      "-hide_banner","-loglevel","error","-y",
      "-ss",String(seek),
      "-i",normalizedPath,
      "-frames:v","1",
      "-vf","scale=w='min(1280,iw)':h=-2:force_divisible_by=2",
      "-q:v","3",
      "-map_metadata","-1",
      previewPath
    ],{timeoutMs:120_000});

    const [normalized,preview]=await Promise.all([
      readFile(normalizedPath),
      readFile(previewPath)
    ]);
    if(!preview.length)throw new PermanentMediaError("VIDEO poster generation returned an empty object");

    return {
      normalized,
      normalizedContentType:"video/mp4",
      preview,
      previewContentType:"image/jpeg"
    };
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
}

export async function assertMediaRuntime(){
  if(!sharp?.versions?.vips)throw new Error("Sharp/libvips runtime is unavailable");
  const [ffmpeg,ffprobe]=await Promise.all([
    runCapture("ffmpeg",["-version"],{timeoutMs:15_000}),
    runCapture("ffprobe",["-version"],{timeoutMs:15_000})
  ]);
  return {
    sharp:sharp.versions.sharp,
    vips:sharp.versions.vips,
    ffmpeg:ffmpeg.stdout.split(/\r?\n/)[0]??"",
    ffprobe:ffprobe.stdout.split(/\r?\n/)[0]??""
  };
}
