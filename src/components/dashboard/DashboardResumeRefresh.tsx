"use client";
import {useEffect} from "react";
import {useRouter} from "next/navigation";

export function DashboardResumeRefresh(){
  const router=useRouter();
  useEffect(()=>{
    let last=0;
    const refresh=()=>{
      const now=Date.now();
      if(now-last<750)return;
      last=now;
      router.refresh();
    };
    const onPageShow=()=>refresh();
    const onFocus=()=>refresh();
    const onVisibility=()=>{if(document.visibilityState==="visible")refresh();};
    window.addEventListener("pageshow",onPageShow);
    window.addEventListener("focus",onFocus);
    document.addEventListener("visibilitychange",onVisibility);
    return()=>{
      window.removeEventListener("pageshow",onPageShow);
      window.removeEventListener("focus",onFocus);
      document.removeEventListener("visibilitychange",onVisibility);
    };
  },[router]);
  return null;
}
