import Link from "next/link";
import { notFound } from "next/navigation";
import { demoSchedules, findDemoTask } from "@/lib/demoWorkspace";

export default async function DemoTaskDetail({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const task=findDemoTask(id);
  if(!task) notFound();
  const usage=demoSchedules.filter((s)=>s.taskIds.includes(task.id));

  return <main className="container">
    <div className="breadcrumbs"><Link href="/demo/tasks">Tasks</Link> / {task.name}</div>
    <div className="row"><h1 style={{marginRight:"auto"}}>Task</h1><span className="statusPill active">{task.status}</span></div>

    <div className="card">
      <div className="formGrid">
        <label>Task Name<textarea name="name" value={task.name} readOnly rows={2}/></label>
        <label>Category<input value={task.category} readOnly/></label>
      </div>
      <label>Task Description
        <div className="demoReadOnlyEditor">
          <p><strong>Purpose</strong></p>
          <p>{task.description}</p>
          <p><strong>Best-practice execution guidance</strong></p>
          <ul><li>Confirm the Work Area is safe and ready before starting.</li><li>Follow the sequence defined by the Schedule.</li><li>Record exceptions as notes rather than silently bypassing them.</li><li>Capture required evidence when the generated occurrence requires it.</li></ul>
        </div>
      </label>
      <div className="row" style={{marginTop:18,alignItems:"center"}}><div style={{marginRight:"auto"}}><strong>Attachments</strong><p className="muted" style={{margin:0}}>{task.attachmentCount} sample reference attachment{task.attachmentCount===1?"":"s"} represented in this Demo.</p></div><span className="demoReadOnlyBadge">Evidence example: {task.evidence}</span></div>
    </div>

    <div className="card" style={{marginTop:20}}>
      <div className="row"><div style={{marginRight:"auto"}}><h2 style={{marginBottom:4}}>Used in Schedules</h2><p className="muted">Open a Schedule to see this Task in its operational sequence.</p></div><Link className="button" href={`/tasks/new?demoTask=${encodeURIComponent(task.id)}`}>Use this Task as a template</Link></div>
      <table className="table"><thead><tr><th>Schedule</th><th>Cadence</th><th></th></tr></thead><tbody>{usage.map((s)=><tr key={s.id}><td><strong>{s.name}</strong></td><td>{s.cadence}</td><td><Link href={`/demo/schedules/${s.id}`}>Open</Link></td></tr>)}{!usage.length&&<tr><td colSpan={3} className="muted">This reference Task is not currently used by a Demo Schedule.</td></tr>}</tbody></table>
    </div>
  </main>;
}
