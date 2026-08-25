import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { getSessionUser } from '@/lib/session';
import { prisma } from '@/lib/prisma';
export default async function Properties(){const user=await getSessionUser();if(!user)redirect('/login');const m=await prisma.organizationMember.findFirst({where:{userId:user.id,status:'ACTIVE'}});if(!m)redirect('/onboarding');const properties=await prisma.property.findMany({where:{organizationId:m.organizationId},include:{_count:{select:{workAreas:true}}},orderBy:{name:'asc'}});return <><Nav/><main className="container"><div className="row"><h1 style={{marginRight:'auto'}}>Properties</h1><Link className="button" href="#new">Add Property</Link></div><div className="card"><table className="table"><thead><tr><th>Name</th><th>City</th><th>Work Areas</th></tr></thead><tbody>{properties.map(p=><tr key={p.id}><td>{p.name}</td><td>{p.city??'—'}</td><td>{p._count.workAreas}</td></tr>)}{!properties.length&&<tr><td colSpan={3} className="muted">No properties yet.</td></tr>}</tbody></table></div></main></>}
