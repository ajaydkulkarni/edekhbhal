import {
  PermanentMediaError,
  compareObservedToExpected,
  computeRetrySeconds,
  normalizePhoto,
  normalizeVideo,
  observedSource
} from "./evidence-media.mjs";

function envInt(name,defaultValue,{min,max}){
  const raw=process.env[name]?.trim();
  if(!raw)return defaultValue;
  const value=Number(raw);
  if(!Number.isInteger(value)||value<min||value>max)
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return value;
}

function safeError(error){
  const message=error instanceof Error?error.message:String(error);
  return message.replace(/\s+/g," ").trim().slice(0,1800)||"Unknown worker error";
}

function parseEvent(event){
  if(!event)throw new Error("Worker event is required.");
  const payload=event.result_payload_json;
  if(!payload||typeof payload!=="object"||Array.isArray(payload))
    throw new Error("Evidence worker event payload must be a JSON object.");
  const eventId=String(event.result_event_id??"");
  const organizationId=String(event.result_organization_id??"");
  const eventType=String(event.result_event_type??"");
  const aggregateId=String(event.result_aggregate_id??"");
  const claimToken=String(event.result_claim_token??"");
  const attemptCount=Number(event.result_attempt_count??1);
  if(!eventId||!organizationId||!eventType||!aggregateId||!claimToken)
    throw new Error("Evidence worker event is missing required claim fields.");
  if(String(payload.evidenceId??"")!==aggregateId)
    throw new Error("Evidence worker payload evidenceId does not match aggregate id.");
  if(String(payload.organizationId??"")!==organizationId)
    throw new Error("Evidence worker payload organizationId does not match event organization.");
  return {eventId,organizationId,eventType,aggregateId,claimToken,attemptCount,payload};
}

function processingInfo(row){
  if(!row)throw new Error("Event-bound Evidence processing claim returned no row.");
  return {
    evidenceId:String(row.result_evidence_id),
    organizationId:String(row.result_organization_id),
    bucket:String(row.result_storage_bucket),
    objectKey:String(row.result_object_key),
    evidenceType:String(row.result_evidence_type),
    contentType:String(row.result_content_type).toLowerCase(),
    byteSize:Number(row.result_byte_size),
    sha256Hex:String(row.result_sha256_hex).toLowerCase(),
    claimToken:String(row.result_claim_token),
    version:Number(row.result_version)
  };
}

function processingTargets(row){
  if(!row)throw new Error("Evidence processing target command returned no row.");
  return {
    normalizedKey:String(row.result_normalized_object_key),
    normalizedContentType:String(row.result_normalized_content_type),
    previewKey:String(row.result_preview_object_key),
    previewContentType:String(row.result_preview_content_type)
  };
}

function startHeartbeat(transport,event,processing,config){
  let stopped=false;
  let heartbeatError=null;
  let running=Promise.resolve();

  async function beat(){
    if(stopped||heartbeatError)return;
    try{
      await transport.renewEventLease(event.eventId,event.claimToken,config.eventLeaseSeconds);
      if(processing){
        await transport.renewProcessingLease(
          processing.evidenceId,
          processing.version,
          processing.claimToken,
          config.processingLeaseSeconds
        );
      }
    }catch(error){
      heartbeatError=error;
    }
  }

  const timer=setInterval(()=>{
    running=running.then(beat);
  },config.heartbeatIntervalMs);
  timer.unref?.();

  return {
    async beatNow(){
      running=running.then(beat);
      await running;
      if(heartbeatError)throw heartbeatError;
    },
    assertHealthy(){
      if(heartbeatError)throw heartbeatError;
    },
    async stop(){
      stopped=true;
      clearInterval(timer);
      await running.catch(()=>{});
    }
  };
}

async function bestEffortDerivativeCleanup(transport,processing,targets,uploaded){
  for(const key of uploaded.reverse()){
    try{
      await transport.deleteObject(processing.bucket,key);
    }catch(error){
      console.warn(`Evidence worker derivative cleanup deferred for ${key}: ${safeError(error)}`);
    }
  }
  if(uploaded.length===0&&targets){
    // Nothing was confirmed uploaded in this attempt.
  }
}

async function rejectObservation(transport,event,processing,observed,reason){
  await transport.rejectProcessingObservation({
    evidenceId:processing.evidenceId,
    expectedVersion:processing.version,
    claimToken:processing.claimToken,
    observedContentType:observed?.contentType??null,
    observedByteSize:observed?.byteSize??null,
    observedSha256Hex:observed?.sha256Hex??null,
    reason,
    idempotencyKey:`process-reject:${event.eventId}:${event.claimToken}`
  });
  const terminal=await transport.completeEventIfTerminal(event.eventId,event.claimToken);
  if(!terminal)throw new Error("Rejected Evidence did not reach terminal event state.");
}

async function scheduleRetry(transport,event,processing,error,config){
  const message=safeError(error);
  if(processing){
    try{
      await transport.releaseProcessingForRetry(
        processing.evidenceId,
        processing.version,
        processing.claimToken,
        message
      );
    }catch(releaseError){
      console.warn(`Evidence worker could not explicitly expire processing lease: ${safeError(releaseError)}`);
    }
  }
  await transport.failEvent(
    event.eventId,
    event.claimToken,
    message,
    computeRetrySeconds(event.attemptCount)
  );
  console.warn(`Evidence worker scheduled retry for ${event.eventType} event ${event.eventId}: ${message}`);
}

async function processEvidenceEvent(transport,event,config){
  let processing=null;
  let targets=null;
  let observed=null;
  let uploaded=[];
  let heartbeat=null;
  let terminalTransition=false;

  try{
    processing=processingInfo(await transport.claimProcessingForEvent(
      event.eventId,
      event.claimToken,
      `process-claim:${event.eventId}:${event.claimToken}`
    ));
    targets=processingTargets(await transport.getProcessingTargets(
      processing.evidenceId,
      processing.version,
      processing.claimToken
    ));

    heartbeat=startHeartbeat(transport,event,processing,config);
    await heartbeat.beatNow();

    const source=await transport.downloadObject(processing.bucket,processing.objectKey);
    observed=observedSource(source);

    const comparison=compareObservedToExpected(observed,{
      contentType:processing.contentType,
      byteSize:processing.byteSize,
      sha256Hex:processing.sha256Hex
    });

    if(!comparison.matches){
      await rejectObservation(
        transport,event,processing,observed,
        `SOURCE_METADATA_MISMATCH: ${comparison.mismatches.join("; ")}`
      );
      terminalTransition=true;
      console.log(`Evidence ${processing.evidenceId} rejected because independent source observation did not match upload metadata.`);
      return;
    }

    if(processing.evidenceType==="PHOTO"&&!processing.contentType.startsWith("image/")){
      await rejectObservation(transport,event,processing,observed,"SOURCE_TYPE_MISMATCH: PHOTO evidence is not an image MIME type");
      terminalTransition=true;
      return;
    }
    if(processing.evidenceType==="VIDEO"&&!processing.contentType.startsWith("video/")){
      await rejectObservation(transport,event,processing,observed,"SOURCE_TYPE_MISMATCH: VIDEO evidence is not a video MIME type");
      terminalTransition=true;
      return;
    }

    let derivatives;
    try{
      derivatives=processing.evidenceType==="PHOTO"
        ?await normalizePhoto(source,observed.contentType)
        :processing.evidenceType==="VIDEO"
          ?await normalizeVideo(source,observed.contentType)
          :(()=>{throw new PermanentMediaError(`Unsupported Evidence type ${processing.evidenceType}`);})();
    }catch(error){
      if(error instanceof PermanentMediaError||event.attemptCount>=config.maxAttempts){
        await rejectObservation(
          transport,
          event,
          processing,
          observed,
          error instanceof PermanentMediaError
            ?`MEDIA_VALIDATION_FAILED: ${safeError(error)}`
            :`PROCESSING_FAILED_AFTER_${config.maxAttempts}_ATTEMPTS: ${safeError(error)}`
        );
        terminalTransition=true;
        console.log(`Evidence ${processing.evidenceId} rejected after media processing could not produce safe derivatives.`);
        return;
      }
      throw error;
    }

    heartbeat.assertHealthy();
    await heartbeat.beatNow();

    if(derivatives.normalizedContentType!==targets.normalizedContentType)
      throw new Error("Generated normalized media type does not match the server-owned target contract.");
    if(derivatives.previewContentType!==targets.previewContentType)
      throw new Error("Generated preview media type does not match the server-owned target contract.");

    await transport.uploadObject(
      processing.bucket,
      targets.normalizedKey,
      derivatives.normalized,
      derivatives.normalizedContentType
    );
    uploaded.push(targets.normalizedKey);

    await heartbeat.beatNow();

    await transport.uploadObject(
      processing.bucket,
      targets.previewKey,
      derivatives.preview,
      derivatives.previewContentType
    );
    uploaded.push(targets.previewKey);

    await heartbeat.beatNow();

    await transport.completeProcessing({
      evidenceId:processing.evidenceId,
      expectedVersion:processing.version,
      claimToken:processing.claimToken,
      result:"VERIFIED",
      observedContentType:observed.contentType,
      observedByteSize:observed.byteSize,
      observedSha256Hex:observed.sha256Hex,
      normalizedByteSize:derivatives.normalized.byteLength,
      retainOriginal:false,
      reason:null,
      idempotencyKey:`process-complete:${event.eventId}:${event.claimToken}`
    });
    terminalTransition=true;

    const terminal=await transport.completeEventIfTerminal(event.eventId,event.claimToken);
    if(!terminal)throw new Error("VERIFIED Evidence did not reach terminal event state.");

    console.log(`Evidence ${processing.evidenceId} VERIFIED; normalized and preview derivatives uploaded to server-owned keys.`);
  }catch(error){
    if(heartbeat)await heartbeat.stop();

    if(terminalTransition){
      // The aggregate is already terminal. Leave the outbox delivery for
      // terminal-state reconciliation if acknowledgement itself failed.
      try{
        const terminal=await transport.completeEventIfTerminal(event.eventId,event.claimToken);
        if(terminal)return;
      }catch{}
      try{
        await transport.failEvent(
          event.eventId,event.claimToken,
          `Terminal Evidence state reached but queue acknowledgement must retry: ${safeError(error)}`,
          computeRetrySeconds(event.attemptCount)
        );
        return;
      }catch{
        throw error;
      }
    }

    if(processing&&targets&&uploaded.length){
      await bestEffortDerivativeCleanup(transport,processing,targets,uploaded);
    }

    if(event.attemptCount>=config.maxAttempts&&processing&&observed){
      try{
        await rejectObservation(
          transport,event,processing,observed,
          `PROCESSING_FAILED_AFTER_${config.maxAttempts}_ATTEMPTS: ${safeError(error)}`
        );
        return;
      }catch(rejectError){
        console.warn(`Evidence worker terminal rejection also failed: ${safeError(rejectError)}`);
      }
    }

    await scheduleRetry(transport,event,processing,error,config);
  }finally{
    if(heartbeat)await heartbeat.stop();
  }
}

async function processDeletionEvent(transport,event,config){
  const heartbeat=startHeartbeat(transport,event,null,config);
  try{
    const payload=event.payload;
    const bucket=String(payload.storageBucket??"");
    const objectKey=String(payload.objectKey??"");
    const evidenceVersion=Number(payload.evidenceVersion);
    if(!bucket||!objectKey||!Number.isInteger(evidenceVersion)||evidenceVersion<1)
      throw new Error("Original-deletion event payload is incomplete.");

    await heartbeat.beatNow();
    await transport.deleteObject(bucket,objectKey);
    await heartbeat.beatNow();

    await transport.markOriginalDeletedForEvent(
      event.eventId,
      event.claimToken,
      `original-delete:${event.eventId}`
    );

    const terminal=await transport.completeEventIfTerminal(event.eventId,event.claimToken);
    if(!terminal)throw new Error("Original deletion acknowledgement did not reach terminal event state.");

    console.log(`Evidence ${event.aggregateId} original object deleted and acknowledged.`);
  }catch(error){
    try{
      const terminal=await transport.completeEventIfTerminal(event.eventId,event.claimToken);
      if(terminal)return;
    }catch{}
    await transport.failEvent(
      event.eventId,event.claimToken,safeError(error),computeRetrySeconds(event.attemptCount)
    );
    console.warn(`Evidence worker scheduled original-deletion retry for event ${event.eventId}: ${safeError(error)}`);
  }finally{
    await heartbeat.stop();
  }
}

export function workerConfig(){
  const eventLeaseSeconds=envInt("EVIDENCE_WORKER_EVENT_LEASE_SECONDS",120,{min:30,max:300});
  const processingLeaseSeconds=envInt("EVIDENCE_WORKER_PROCESSING_LEASE_SECONDS",300,{min:60,max:300});
  const heartbeatIntervalMs=envInt("EVIDENCE_WORKER_HEARTBEAT_INTERVAL_MS",30_000,{min:5_000,max:90_000});
  if(heartbeatIntervalMs>=eventLeaseSeconds*500)
    throw new Error("EVIDENCE_WORKER_HEARTBEAT_INTERVAL_MS must be less than half the event lease.");
  return {
    eventLeaseSeconds,
    processingLeaseSeconds,
    heartbeatIntervalMs,
    pollIntervalMs:envInt("EVIDENCE_WORKER_POLL_INTERVAL_MS",3_000,{min:500,max:60_000}),
    maxAttempts:envInt("EVIDENCE_WORKER_MAX_ATTEMPTS",5,{min:1,max:20})
  };
}

export async function processOneEvidenceWorkerEvent(transport,config=workerConfig()){
  const claimed=await transport.claimEvent(config.eventLeaseSeconds);
  if(!claimed)return false;

  const event=parseEvent(claimed);

  const alreadyTerminal=await transport.completeEventIfTerminal(event.eventId,event.claimToken);
  if(alreadyTerminal){
    console.log(`Evidence worker reconciled already-terminal ${event.eventType} event ${event.eventId}.`);
    return true;
  }

  if(event.eventType==="EVIDENCE_PROCESS_REQUESTED"){
    await processEvidenceEvent(transport,event,config);
    return true;
  }
  if(event.eventType==="EVIDENCE_ORIGINAL_DELETE_REQUESTED"){
    await processDeletionEvent(transport,event,config);
    return true;
  }

  await transport.failEvent(
    event.eventId,event.claimToken,
    `Unsupported Evidence worker event type ${event.eventType}`,
    computeRetrySeconds(event.attemptCount)
  );
  return true;
}

function sleep(ms){
  return new Promise(resolve=>setTimeout(resolve,ms));
}

export async function runEvidenceWorker(transport,{once=false,signal,config=workerConfig()}={}){
  if(once){
    const worked=await processOneEvidenceWorkerEvent(transport,config);
    if(!worked)console.log("Evidence worker found no currently available Evidence events.");
    return;
  }

  console.log(`Evidence worker ${transport.workerId} started real media-processing loop.`);
  while(!signal?.aborted){
    try{
      const worked=await processOneEvidenceWorkerEvent(transport,config);
      if(!worked)await sleep(config.pollIntervalMs);
    }catch(error){
      console.error(`Evidence worker loop error: ${safeError(error)}`);
      await sleep(config.pollIntervalMs);
    }
  }
  console.log("Evidence worker stop requested; current loop exited.");
}
