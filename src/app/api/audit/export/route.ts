import * as XLSX from "xlsx";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const MAX_EXPORT = 10000;
function dateOk(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}
function json(value: unknown) {
  if (value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}
function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"','""')}"`;
}

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return Response.json({error:"Unauthorized"},{status:401});
  const membership = await prisma.organizationMember.findFirst({where:{userId:user.id,status:"ACTIVE"}});
  if (!membership || !["ADMIN","PROPERTY_MANAGER"].includes(membership.role)) {
    return Response.json({error:"Forbidden"},{status:403});
  }

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();
  const who = (url.searchParams.get("who") || "").trim().toLowerCase();
  const action = (url.searchParams.get("action") || "").trim();
  const entityType = (url.searchParams.get("entityType") || "").trim().toLowerCase();
  const entityId = (url.searchParams.get("entityId") || "").trim().toLowerCase();
  const dateFrom = dateOk(url.searchParams.get("dateFrom"));
  const dateTo = dateOk(url.searchParams.get("dateTo"));
  const sort = url.searchParams.get("sort") === "oldest" ? "oldest" : "newest";

  const createdAt:any = {};
  if (dateFrom) createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
  if (dateTo) createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`);

  const rows = await prisma.auditLog.findMany({
    where:{
      organizationId:membership.organizationId,
      ...(action ? {action:action as any} : {}),
      ...(dateFrom || dateTo ? {createdAt} : {})
    },
    include:{user:true},
    orderBy:{createdAt:sort==="oldest"?"asc":"desc"},
    take:MAX_EXPORT
  });

  const filtered = rows.filter(r=>{
    const whoValue=(r.user?.name||r.user?.email||"System").toLowerCase();
    if(who && !whoValue.includes(who)) return false;
    if(entityType && !(r.entityType||"").toLowerCase().includes(entityType)) return false;
    if(entityId && !(r.entityId||"").toLowerCase().includes(entityId)) return false;
    if(search){
      const haystack=[r.user?.name,r.user?.email,r.action,r.entityType,r.entityId,json(r.oldValue),json(r.newValue),json(r.metadata),r.ipAddress,r.userAgent].filter(Boolean).join(" ").toLowerCase();
      if(!haystack.includes(search)) return false;
    }
    return true;
  });

  const exportRows=filtered.map(r=>({
    When:r.createdAt.toISOString(),
    Who:r.user?.name||r.user?.email||"System",
    Email:r.user?.email||"",
    Action:r.action,
    Result:r.result,
    "Entity Type":r.entityType||"",
    "Entity ID":r.entityId||"",
    "Old Value":r.oldValue?JSON.stringify(r.oldValue):"",
    "New Value":r.newValue?JSON.stringify(r.newValue):"",
    Metadata:r.metadata?JSON.stringify(r.metadata):"",
    "IP Address":r.ipAddress||"",
    "User Agent":r.userAgent||"",
    "Request ID":r.requestId||""
  }));
  const stamp=new Date().toISOString().slice(0,10);

  if(format==="xlsx"){
    const ws=XLSX.utils.json_to_sheet(exportRows);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,"Audit Trail");
    const binary=XLSX.write(wb,{type:"array",bookType:"xlsx"});
    return new Response(new Uint8Array(binary),{headers:{
      "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition":`attachment; filename="edekhbhal-audit-${stamp}.xlsx"`
    }});
  }

  const headers=["When","Who","Email","Action","Result","Entity Type","Entity ID","Old Value","New Value","Metadata","IP Address","User Agent","Request ID"];
  const csv=[headers.map(csvCell).join(","),...exportRows.map(row=>headers.map(key=>csvCell((row as any)[key])).join(","))].join("\r\n");
  return new Response("\ufeff"+csv,{headers:{
    "Content-Type":"text/csv; charset=utf-8",
    "Content-Disposition":`attachment; filename="edekhbhal-audit-${stamp}.csv"`
  }});
}
