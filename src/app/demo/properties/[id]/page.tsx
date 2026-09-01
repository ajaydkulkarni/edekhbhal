import Link from "next/link";
import { notFound } from "next/navigation";
import { findDemoProperty, demoTeam } from "@/lib/demoWorkspace";
import { getDemoViewRole } from "@/lib/demoRole";

export default async function DemoPropertyDetail({
  params, searchParams
}: {
  params: Promise<{id:string}>;
  searchParams: Promise<{tab?:string}>;
}) {
  const { id } = await params;
  const { tab = "details" } = await searchParams;
  const role = await getDemoViewRole();
  const property = findDemoProperty(id);
  if (!property) notFound();
  if (role !== "ADMIN" && property.id !== "freshbite-foods") notFound();

  const assigned = demoTeam.filter((m)=>m.assignedPropertyIds.includes(property.id));
  const tabs = [["details","Property Details"],["work-areas","Work Areas"],["team","Team Assignments"]];

  return <main className="container">
    <div className="breadcrumbs"><Link href="/demo/properties">Properties</Link> / {property.name}</div>
    <div className="row"><div style={{marginRight:"auto"}}><h1>{property.name}</h1><p className="muted">Parent Organization: eDekhbhal Best Practice Demo</p></div><span className="demoReadOnlyBadge">Read-only</span></div>
    <div className="row" style={{marginBottom:18}}>{tabs.map(([key,label])=><Link key={key} className={`button small ${tab===key?"":"secondary"}`} href={`/demo/properties/${property.id}?tab=${key}`}>{label}</Link>)}</div>

    {tab==="work-areas" ? <div className="card"><table className="table"><thead><tr><th>Work Area</th><th>Location</th><th>Status</th><th>Service Status</th><th>Demo QR</th></tr></thead><tbody>{property.workAreas.map((w)=><tr key={w.id}><td><strong>{w.name}</strong><br/><span className="muted">{w.description}</span></td><td>{w.locationIdentifier}</td><td>{w.status}</td><td><Link href={`/demo/work-areas/${w.id}`}>View</Link></td><td><Link href={`/demo-qr/${w.id}`} target="_blank">Open</Link></td></tr>)}</tbody></table></div>
    : tab==="team" ? <div className="card"><table className="table"><thead><tr><th>Name</th><th>Role</th><th>Title</th></tr></thead><tbody>{assigned.map((m)=><tr key={m.id}><td><strong>{m.name}</strong></td><td>{m.role.replaceAll("_"," ")}</td><td>{m.title}</td></tr>)}</tbody></table></div>
    : <>
      <div className="card"><h2>Property Details</h2><div className="formGrid"><label>Name<input value={property.name} readOnly/></label><label>Status<input value={property.status} readOnly/></label><label>Industry<input value={property.industry} readOnly/></label><label>Timezone<input value={property.timezone} readOnly/></label><label>City<input value={property.city} readOnly/></label><label>State<input value={property.state} readOnly/></label></div><p className="muted">{property.description}</p></div>
      <div className="card" style={{marginTop:20}}><h2>Property Working Hours</h2><p className="muted">Read-only sample configuration. Effective hours demonstrate the same Organization → Property → Work Area inheritance model as the real workspace.</p><p><strong>Monday–Friday:</strong> 06:00–22:00</p><p><strong>Saturday:</strong> 07:00–18:00</p><p><strong>Sunday:</strong> Closed / operation-specific exceptions</p></div>
    </>}
  </main>;
}
