"use client";

type Attachment = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

function readable(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentPreview({ attachment }: { attachment: Attachment }) {
  const url = `/api/task-attachments/${attachment.id}/content`;
  const image = attachment.mimeType.startsWith("image/");
  const pdf = attachment.mimeType === "application/pdf";
  const text = attachment.mimeType.startsWith("text/");

  return (
    <div className="attachmentCard">
      <div className="attachmentThumb">
        {image ? (
          <img src={url} alt={attachment.fileName} />
        ) : pdf || text ? (
          <iframe src={url} title={attachment.fileName} sandbox="" />
        ) : (
          <div className="fileTile">
            <span className="fileExt">{attachment.fileName.split(".").pop()?.slice(0, 5).toUpperCase() || "FILE"}</span>
          </div>
        )}
      </div>
      <div className="attachmentMeta">
        <a href={url} target="_blank" rel="noreferrer">{attachment.fileName}</a>
        <span>{readable(attachment.sizeBytes)}</span>
      </div>
    </div>
  );
}
