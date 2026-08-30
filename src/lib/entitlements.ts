import {prisma} from "@/lib/prisma";

export async function entitlementValue(organizationId:string,code:string){
 const row=await prisma.organizationEntitlement.findUnique({where:{organizationId_code:{organizationId,code}}});
 if(!row||!row.enabled)return null;
 if(row.startsAt&&row.startsAt>new Date())return null;
 if(row.endsAt&&row.endsAt<new Date())return null;
 return row.limitValue;
}
export async function hasFeature(organizationId:string,code:string){
 const row=await prisma.organizationEntitlement.findUnique({where:{organizationId_code:{organizationId,code}}});
 if(!row||row.type!=="FEATURE"||!row.enabled)return false;
 const now=new Date();return(!row.startsAt||row.startsAt<=now)&&(!row.endsAt||row.endsAt>=now);
}
export async function withinLimit(organizationId:string,code:string,currentUsage:number){
 const row=await prisma.organizationEntitlement.findUnique({where:{organizationId_code:{organizationId,code}}});
 if(!row||row.type!=="LIMIT"||!row.enabled||row.limitValue==null)return true;
 return currentUsage<row.limitValue;
}
