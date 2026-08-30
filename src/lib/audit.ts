import {ActionType,AuditResult,Prisma} from "@prisma/client";
import {headers} from "next/headers";
import {prisma} from "./prisma";

type AuditInput={organizationId?:string|null;userId?:string|null;action:ActionType;result?:AuditResult;entityType?:string;entityId?:string;oldValue?:Prisma.InputJsonValue|null;newValue?:Prisma.InputJsonValue|null;metadata?:Prisma.InputJsonValue|null;ipAddress?:string|null;userAgent?:string|null;requestId?:string|null};
function jsonValue(value:Prisma.InputJsonValue|null|undefined){if(value===null)return Prisma.JsonNull;return value;}
async function requestContext(){
 try{
  const h=await headers();
  const forwarded=h.get("x-vercel-forwarded-for")||h.get("x-forwarded-for")||h.get("x-real-ip");
  return{ipAddress:forwarded?.split(",")[0]?.trim()||null,userAgent:h.get("user-agent")||null,requestId:h.get("x-vercel-id")||h.get("x-request-id")||null};
 }catch{return{ipAddress:null,userAgent:null,requestId:null};}
}
export async function audit(input:AuditInput,tx:Prisma.TransactionClient=prisma){
 const context=await requestContext();
 const data:Prisma.AuditLogUncheckedCreateInput={organizationId:input.organizationId??null,userId:input.userId??null,action:input.action,result:input.result??AuditResult.SUCCESS,entityType:input.entityType??null,entityId:input.entityId??null,oldValue:jsonValue(input.oldValue),newValue:jsonValue(input.newValue),metadata:jsonValue(input.metadata),ipAddress:input.ipAddress??context.ipAddress,userAgent:input.userAgent??context.userAgent,requestId:input.requestId??context.requestId};
 return tx.auditLog.create({data});
}
