import { randomUUID } from "node:crypto";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth/server-session";
import { getOnboardingSnapshot, onboardingPath } from "@/lib/onboarding/server";
import { createTask, toggleTaskStatus, updateTask } from "@/lib/tasks/actions";
import { canManageTasks, listTasks } from "@/lib/tasks/server";

type Props = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function TasksPage({ searchParams }: Props) {
  const user = await requireAuthenticatedUser();
  const snapshot = await getOnboardingSnapshot(user.id);

  if (!snapshot || snapshot.onboarding_state !== "ONBOARDING_COMPLETE") {
    redirect(onboardingPath(snapshot?.onboarding_state ?? "REGISTERED"));
  }
  if (!snapshot.app_user_id || !snapshot.organization_id || !snapshot.membership_id) {
    redirect("/workspace");
  }

  const context = {
    userId: snapshot.app_user_id,
    organizationId: snapshot.organization_id,
    membershipId: snapshot.membership_id,
  };

  const [tasks, manageAllowed, params] = await Promise.all([
    listTasks(context),
    canManageTasks(context),
    searchParams,
  ]);

  return (
    <main className="workspacePage">
      <header className="workspaceHeader">
        <div>
          <span className="eyebrow">ORGANIZATION LIBRARY</span>
          <h1>Tasks</h1>
          <p>{snapshot.organization_name} · {tasks.length} reusable Task{tasks.length === 1 ? "" : "s"}</p>
        </div>
        <Link className="button secondaryButton" href="/workspace">Workspace</Link>
      </header>

      {params.error ? <div className="formNotice errorNotice workspaceNotice">{params.error}</div> : null}
      {params.message ? <div className="formNotice successNotice workspaceNotice">{params.message}</div> : null}

      <section className="workspacePanel">
        <span className="eyebrow">TASK MASTER FOUNDATION</span>
        <h2>Reusable Organization-level work instructions</h2>
        <p className="muted">
          Tasks are reusable masters and are not tied to one Site or Work Area. Rich HTML instruction
          source is stored for later Schedule composition. Task media will use private object storage;
          Base64 media is not stored in PostgreSQL.
        </p>
      </section>

      {manageAllowed ? (
        <section className="workspacePanel">
          <span className="eyebrow">NEW TASK</span>
          <h2>Create a reusable Task</h2>
          <form action={createTask} className="formStack">
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <label>
              Task name
              <input name="name" placeholder="Clean main entrance glass" required />
            </label>
            <label>
              Rich instructions / HTML
              <textarea
                name="instructionsHtml"
                rows={7}
                placeholder="<p>Clean both sides of the entrance glass.</p><ul><li>Use approved cleaner</li><li>Check corners</li></ul>"
              />
            </label>
            <small className="muted">
              HTML is stored as Task source. This management screen shows a text-safe preview instead of executing stored markup.
            </small>
            <button className="button" type="submit">Create Task</button>
          </form>
        </section>
      ) : (
        <section className="workspacePanel">
          <span className="eyebrow">READ ONLY</span>
          <h2>Task library access</h2>
          <p className="muted">Your current role can read reusable Tasks but cannot change the Task master.</p>
        </section>
      )}

      <section className="taskGrid">
        {tasks.length === 0 ? (
          <article className="workspacePanel">
            <h2>No Tasks yet</h2>
            <p>Create the first reusable Task before composing Schedules.</p>
          </article>
        ) : tasks.map((task) => (
          <article className="taskCard" key={task.id}>
            <div className="taskCardHead">
              <div>
                <span className={`statusPill ${task.status === "ACTIVE" ? "activePill" : "inactivePill"}`}>
                  {task.status}
                </span>
                <h2>{task.name}</h2>
              </div>
              <span className="taskVersion">v{task.version}</span>
            </div>

            <p className="taskPreview">
              {task.instructions_preview || "No instructions have been entered."}
            </p>

            <div className="taskMetaRow">
              <span>{task.attachment_count} attachment metadata record{task.attachment_count === 1 ? "" : "s"}</span>
              <span>Private object-storage contract ready</span>
            </div>

            {manageAllowed ? (
              <>
                <details className="taskEdit">
                  <summary>Edit Task</summary>
                  <form action={updateTask} className="formStack">
                    <input type="hidden" name="taskId" value={task.id} />
                    <input type="hidden" name="version" value={task.version} />
                    <label>
                      Task name
                      <input name="name" defaultValue={task.name} required />
                    </label>
                    <label>
                      Rich instructions / HTML
                      <textarea name="instructionsHtml" rows={7} defaultValue={task.instructions_html} />
                    </label>
                    <button className="button" type="submit">Save Task</button>
                  </form>
                </details>

                <form action={toggleTaskStatus} className="taskStatusForm">
                  <input type="hidden" name="taskId" value={task.id} />
                  <input type="hidden" name="version" value={task.version} />
                  <input type="hidden" name="currentStatus" value={task.status} />
                  <button className="button secondaryButton" type="submit">
                    {task.status === "ACTIVE" ? "Make inactive" : "Reactivate"}
                  </button>
                </form>
              </>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
