import {prisma} from "@/lib/prisma";
import {requireMobileMembership,mobileErrorResponse} from "@/lib/mobileAuth";
import {activeOccurrenceForUser,occurrenceDto,occurrenceInclude,releaseExpiredClaims} from "@/lib/mobileExecution";
import {supersedeDueOccurrences} from "@/lib/occurrenceSupersession";

export async function GET(req:Request){
 try{
  const{user,membership,organization}=await requireMobileMembership(req);
  await releaseExpiredClaims(membership.organizationId);
  await supersedeDueOccurrences({organizationId:membership.organizationId});
  const assignments=await prisma.organizationMemberProperty.findMany({where:{organizationMemberId:membership.id},select:{propertyId:true}});
  const propertyIds=assignments.map(x=>x.propertyId);
  const active=await activeOccurrenceForUser(membership.organizationId,user.id);
  if(active){
   if(!propertyIds.includes(active.workArea.property.id))return Response.json({state:"EMPTY",occurrence:null,claimExpiryMinutes:organization.claimExpiryMinutes});
   return Response.json({state:active.status==="IN_PROGRESS"?"IN_PROGRESS":"CLAIMED",occurrence:occurrenceDto(active),claimExpiryMinutes:organization.claimExpiryMinutes});
  }
  if(!propertyIds.length)return Response.json({state:"EMPTY",occurrence:null,claimExpiryMinutes:organization.claimExpiryMinutes});
  const candidate=await prisma.scheduleOccurrence.findFirst({
   where:{organizationId:membership.organizationId,status:"PENDING",assignedUserId:null,schedule:{status:"ACTIVE"},workArea:{status:"ACTIVE",property:{id:{in:propertyIds},status:"ACTIVE"}}},
   include:occurrenceInclude,orderBy:{scheduledStartAt:"asc"}
  });
  return Response.json({state:candidate?"AVAILABLE":"EMPTY",occurrence:candidate?occurrenceDto(candidate):null,claimExpiryMinutes:organization.claimExpiryMinutes});
 }catch(error){return mobileErrorResponse(error)}
}
