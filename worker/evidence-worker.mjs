#!/usr/bin/env node
import {assertMediaRuntime} from "./lib/evidence-media.mjs";
import {openEvidenceWorkerTransport} from "./lib/evidence-transport.mjs";
import {runEvidenceWorker} from "./lib/evidence-worker-loop.mjs";

const mode=process.argv[2]??"";

if(mode==="--media-check"){
  const versions=await assertMediaRuntime();
  console.log("Evidence worker media runtime check passed.");
  console.log(`Sharp ${versions.sharp} / libvips ${versions.vips}`);
  console.log(versions.ffmpeg);
  console.log(versions.ffprobe);
  process.exit(0);
}

if(!["--probe","--once","--run"].includes(mode)){
  console.log("Evidence Worker Real Media Processing Foundation 03B2 is installed.");
  console.log("Use --probe to verify identities, --media-check to verify codecs, --once to process one available event, or --run for the continuous worker loop.");
  process.exit(0);
}

let worker;
const controller=new AbortController();
const requestStop=()=>controller.abort();
process.once("SIGTERM",requestStop);
process.once("SIGINT",requestStop);

try{
  worker=await openEvidenceWorkerTransport();

  if(mode==="--probe"){
    console.log("Evidence worker transport probe passed.");
    console.log(`Database role: ${worker.databaseRole}`);
    console.log(`Worker id: ${worker.workerId}`);
    console.log(`Storage Auth subject: ${worker.storageAuthSubject}`);
    console.log("03B2 event-bound processing claim, terminal queue acknowledgement, machine-principal mapping, and free-form capability revocation are verified.");
    console.log("No queue event was claimed and no Storage object was read/written/deleted.");
  }else{
    await assertMediaRuntime();
    await runEvidenceWorker(worker,{
      once:mode==="--once",
      signal:controller.signal
    });
  }
}finally{
  process.removeListener("SIGTERM",requestStop);
  process.removeListener("SIGINT",requestStop);
  if(worker)await worker.close();
}
