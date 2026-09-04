#!/usr/bin/env node
import {openEvidenceWorkerTransport} from "./lib/evidence-transport.mjs";

const mode=process.argv[2]??"";
if(mode!=="--probe"){
  console.log("Evidence Worker Transport Foundation 03B1 is installed.");
  console.log("The queue-processing loop and real image/video codecs are intentionally disabled until Foundation 03B2.");
  console.log("Use `npm run worker:evidence:probe` only after deployment-specific worker credentials are provisioned.");
  process.exit(0);
}

let worker;
try{
  worker=await openEvidenceWorkerTransport();
  console.log("Evidence worker transport probe passed.");
  console.log(`Database role: ${worker.databaseRole}`);
  console.log(`Worker id: ${worker.workerId}`);
  console.log(`Storage Auth subject: ${worker.storageAuthSubject}`);
  console.log("DB capability inheritance, machine-principal mapping, and legacy-completion revocation are verified.");
  console.log("No queue event was claimed and no Storage object was read/written/deleted.");
}finally{
  if(worker)await worker.close();
}
