import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { ProfileForm } from "@/components/ProfileForm";
import { getSessionUser } from "@/lib/session";
export default async function ProfilePage(){const user=await getSessionUser();if(!user)redirect("/login");return <><Nav/><main className="container"><h1>My Profile</h1><div className="card"><ProfileForm user={user}/></div></main></>}
