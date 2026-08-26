"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "./RichTextEditor";
import { AttachmentPreview } from "./AttachmentPreview";

type Attachment = { id: string; fileName: string; mimeType: string; sizeBytes: number };
type Task = {
  id: string;
  name: string;
  descriptionHtml: string;
  status: string;
  attachments: Attachment[];
};

const MAX_FILE_BYTES = 2 * 1024 * 1024;

async function fileToBase64(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function TaskEditor({
  task,
  canManage,
  mode = "edit"
}: {
  task?: Task;
  canManage: boolean;
  mode?: "create" | "edit";
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>(task?.attachments || []);

  async function uploadFiles(taskId: string, files: File[]) {
    for (const file of files) {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(`${file.name} exceeds the 2 MB staging attachment limit.`);
      }
      const contentBase64 = await fileToBase64(file);
      const r = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          contentBase64
        })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `Unable to attach ${file.name}`);
      setAttachments((current) => [...current, data.attachment]);
    }
  }

  async function submit(formData: FormData) {
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: String(formData.get("name") || ""),
        descriptionHtml: String(formData.get("descriptionHtml") || "")
      };
      const endpoint = mode === "create" ? "/api/tasks" : `/api/tasks/${task!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const r = await fetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Unable to save task");

      const taskId = mode === "create" ? data.task.id : task!.id;
      const files = Array.from((formData.get("attachments") as File)?.name
        ? [formData.get("attachments") as File]
        : []);
      const input = document.getElementById("task-attachments") as HTMLInputElement | null;
      const selected = input?.files ? Array.from(input.files) : files;
      if (selected.length) await uploadFiles(taskId, selected);

      if (mode === "create") router.push(`/tasks/${taskId}`);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save task");
    } finally {
      setSaving(false);
    }
  }

  async function removeAttachment(id: string) {
    if (!confirm("Remove this attachment from the task?")) return;
    setError("");
    const r = await fetch(`/api/task-attachments/${id}`, { method: "DELETE" });
    const data = await r.json();
    if (!r.ok) setError(data.error || "Unable to remove attachment");
    else {
      setAttachments((current) => current.filter((x) => x.id !== id));
      router.refresh();
    }
  }

  async function toggleStatus() {
    if (!task) return;
    const next = task.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const r = await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next })
    });
    const data = await r.json();
    if (!r.ok) setError(data.error || "Unable to update status");
    else router.refresh();
  }

  return (
    <>
      <form action={submit} className="card">
        <label>
          Task Name
          <textarea
            name="name"
            rows={2}
            required
            minLength={2}
            maxLength={500}
            defaultValue={task?.name || ""}
            disabled={!canManage}
            placeholder="Enter the complete task sentence"
          />
        </label>
        <label>Task Description</label>
        <RichTextEditor name="descriptionHtml" initialHtml={task?.descriptionHtml || ""} disabled={!canManage} />
        {canManage && (
          <label>
            Attach Files
            <input id="task-attachments" type="file" name="attachments" multiple />
            <small className="muted">Staging limit: 2 MB per attachment. Images, PDFs and text files display inline previews.</small>
          </label>
        )}
        {error && <p className="error">{error}</p>}
        {canManage && (
          <div className="row" style={{ marginTop: 18 }}>
            <button className="button" disabled={saving}>{saving ? "Saving..." : mode === "create" ? "Create Task" : "Save Task"}</button>
            {mode === "edit" && task && (
              <button type="button" className="button secondary" onClick={toggleStatus}>
                {task.status === "ACTIVE" ? "Inactivate Task" : "Reactivate Task"}
              </button>
            )}
          </div>
        )}
      </form>

      {mode === "edit" && (
        <section style={{ marginTop: 24 }}>
          <h2>Attachments</h2>
          <div className="attachmentGrid">
            {attachments.map((attachment) => (
              <div key={attachment.id}>
                <AttachmentPreview attachment={attachment} />
                {canManage && <button className="button small danger" style={{ marginTop: 8 }} onClick={() => removeAttachment(attachment.id)}>Remove</button>}
              </div>
            ))}
            {!attachments.length && <p className="muted">No attachments.</p>}
          </div>
        </section>
      )}
    </>
  );
}
