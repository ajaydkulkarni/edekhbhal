"use client";
import { useState } from "react";
import Link from "next/link";

export default function Register() {
  const [email,setEmail]=useState(""); const [message,setMessage]=useState(""); const [error,setError]=useState(""); const [submitting,setSubmitting]=useState(false);
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");setMessage("");setSubmitting(true);
    try{
      const r=await fetch("/api/auth/request-link",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email})});
      const data=await r.json(); if(!r.ok) throw new Error(data.error||"Unable to create authentication link");
      setMessage(`${data.message}${data.devLink?` Development link: ${data.devLink}`:""}`);
    }catch(e){setError(e instanceof Error?e.message:"Unable to create authentication link")}finally{setSubmitting(false)}
  }
  return <main className="container"><div className="card" style={{maxWidth:520,margin:"60px auto"}}>
    <h1>Login</h1><p className="muted">Enter your email to create an authentication link.</p>
    <form onSubmit={submit}><label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label>
    <button className="button" disabled={submitting}>{submitting?"Creating authentication link...":"Send Authentication Link"}</button></form>
    {error&&<p className="error">{error}</p>}{message&&<p className="success" style={{overflowWrap:"anywhere"}}>{message}</p>}
    <p className="muted">Need an account? <Link href="/register">Register</Link></p>
  </div></main>;
}
