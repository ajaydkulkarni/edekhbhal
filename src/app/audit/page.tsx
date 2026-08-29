import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

const PAGE_SIZE = 50;
const MAX_SCAN = 5000;

function dateOk(value: string | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}
function text(value: unknown) {
  if (value == null) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

export default async function Audit({
  searchParams
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const membership = await prisma.organizationMember.findFirst({
    where: { userId: user.id, status: "ACTIVE" },
    include: { organization: true }
  });
  if (!membership) redirect("/onboarding");
  if (!["ADMIN", "PROPERTY_MANAGER"].includes(membership.role)) redirect("/profile");

  const q = await searchParams;
  const search = (q.search || "").trim().toLowerCase();
  const who = (q.who || "").trim().toLowerCase();
  const action = (q.action || "").trim();
  const entityType = (q.entityType || "").trim().toLowerCase();
  const entityId = (q.entityId || "").trim().toLowerCase();
  const dateFrom = dateOk(q.dateFrom);
  const dateTo = dateOk(q.dateTo);
  const sort = q.sort === "oldest" ? "oldest" : "newest";
  const page = Math.max(1, Number(q.page) || 1);

  const createdAt: any = {};
  if (dateFrom) createdAt.gte = new Date(`${dateFrom}T00:00:00.000Z`);
  if (dateTo) createdAt.lte = new Date(`${dateTo}T23:59:59.999Z`);

  const rows = await prisma.auditLog.findMany({
    where: {
      organizationId: membership.organizationId,
      ...(action ? { action: action as any } : {}),
      ...(dateFrom || dateTo ? { createdAt } : {})
    },
    include: { user: true },
    orderBy: { createdAt: sort === "oldest" ? "asc" : "desc" },
    take: MAX_SCAN
  });

  const filtered = rows.filter((r) => {
    const whoValue = (r.user?.name || r.user?.email || "System").toLowerCase();
    if (who && !whoValue.includes(who)) return false;
    if (entityType && !(r.entityType || "").toLowerCase().includes(entityType)) return false;
    if (entityId && !(r.entityId || "").toLowerCase().includes(entityId)) return false;
    if (search) {
      const haystack = [
        r.user?.name, r.user?.email, r.action, r.entityType, r.entityId,
        text(r.oldValue), text(r.newValue), text(r.metadata),
        r.ipAddress, r.userAgent
      ].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const actions = await prisma.auditLog.findMany({
    where: { organizationId: membership.organizationId },
    distinct: ["action"],
    select: { action: true },
    orderBy: { action: "asc" }
  });

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (value && key !== "page") params.set(key, value);
  }
  const csv = new URLSearchParams(params); csv.set("format", "csv");
  const xlsx = new URLSearchParams(params); xlsx.set("format", "xlsx");

  function pageHref(nextPage: number) {
    const p = new URLSearchParams(params); p.set("page", String(nextPage));
    return `/audit?${p.toString()}`;
  }

  return <>
    <Nav />
    <main className="container">
      <div className="row">
        <div style={{marginRight:"auto"}}>
          <h1>Audit Trail</h1>
          <p className="muted">Searchable, filterable Organization audit history.</p>
        </div>
        <a className="button secondary" href={`/api/audit/export?${csv.toString()}`}>Export CSV</a>
        <a className="button secondary" href={`/api/audit/export?${xlsx.toString()}`}>Export Excel</a>
      </div>

      <form className="card" style={{marginBottom:18}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10}}>
          <label>Search Results<input name="search" defaultValue={q.search || ""} placeholder="Search any audit value"/></label>
          <label>From<input name="dateFrom" type="date" defaultValue={dateFrom}/></label>
          <label>To<input name="dateTo" type="date" defaultValue={dateTo}/></label>
          <label>Who<input name="who" defaultValue={q.who || ""}/></label>
          <label>Action<select name="action" defaultValue={action}><option value="">All Actions</option>{actions.map(x=><option key={x.action} value={x.action}>{x.action}</option>)}</select></label>
          <label>Entity Type<input name="entityType" defaultValue={q.entityType || ""}/></label>
          <label>Entity ID<input name="entityId" defaultValue={q.entityId || ""}/></label>
          <label>Sort<select name="sort" defaultValue={sort}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
        </div>
        <div className="row" style={{marginTop:12}}>
          <button className="button">Apply Filters</button>
          <Link className="button secondary" href="/audit">Clear / Reset</Link>
        </div>
      </form>

      <p className="muted">Showing {visible.length} of {filtered.length} matching events{rows.length === MAX_SCAN ? ` (search window capped at ${MAX_SCAN})` : ""}.</p>

      <div className="card" style={{overflowX:"auto"}}>
        <table className="table">
          <thead><tr><th>When</th><th>Who</th><th>Action</th><th>Entity</th><th>Old Value</th><th>New Value</th></tr></thead>
          <tbody>
            {visible.map(r=><tr key={r.id}>
              <td>{r.createdAt.toLocaleString()}</td>
              <td>{r.user?.name || r.user?.email || "System"}</td>
              <td>{r.action}</td>
              <td>{r.entityType || "—"} {r.entityId ? `(${r.entityId})` : ""}</td>
              <td><pre className="mono" style={{maxWidth:420,whiteSpace:"pre-wrap"}}>{r.oldValue ? JSON.stringify(r.oldValue,null,2) : "—"}</pre></td>
              <td><pre className="mono" style={{maxWidth:420,whiteSpace:"pre-wrap"}}>{r.newValue ? JSON.stringify(r.newValue,null,2) : "—"}</pre></td>
            </tr>)}
            {!visible.length && <tr><td colSpan={6} className="muted">No matching audit events.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="row" style={{justifyContent:"space-between",marginTop:14}}>
        {safePage > 1 ? <Link className="button secondary" href={pageHref(safePage-1)}>Previous</Link> : <span/>}
        <span className="muted">Page {safePage} of {totalPages}</span>
        {safePage < totalPages ? <Link className="button secondary" href={pageHref(safePage+1)}>Next</Link> : <span/>}
      </div>
    </main>
  </>;
}
