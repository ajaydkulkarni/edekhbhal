"use client";

import { useEffect, useRef } from "react";

type Props = {
  name: string;
  initialHtml?: string;
  disabled?: boolean;
};

export function RichTextEditor({ name, initialHtml = "", disabled = false }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const hiddenRef = useRef<HTMLInputElement>(null);

  function sync() {
    if (hiddenRef.current && editorRef.current) {
      hiddenRef.current.value = editorRef.current.innerHTML;
    }
  }

  function command(cmd: string, value?: string) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    sync();
  }

  function setFontSize(px: string) {
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand("fontSize", false, "7");
    const fonts = editorRef.current?.querySelectorAll('font[size="7"]');
    fonts?.forEach((font) => {
      const span = document.createElement("span");
      span.style.fontSize = `${px}px`;
      span.innerHTML = font.innerHTML;
      font.replaceWith(span);
    });
    sync();
  }

  useEffect(() => sync(), []);

  return (
    <div className="richEditor">
      {!disabled && (
        <div className="richToolbar">
          <button type="button" onClick={() => command("bold")}><strong>B</strong></button>
          <button type="button" onClick={() => command("italic")}><em>I</em></button>
          <button type="button" onClick={() => command("underline")}><u>U</u></button>
          <button type="button" onClick={() => command("insertUnorderedList")}>• List</button>
          <button type="button" onClick={() => command("insertOrderedList")}>1. List</button>
          <select defaultValue="16" onChange={(e) => setFontSize(e.target.value)} aria-label="Font size">
            <option value="12">12 px</option>
            <option value="14">14 px</option>
            <option value="16">16 px</option>
            <option value="18">18 px</option>
            <option value="20">20 px</option>
            <option value="24">24 px</option>
            <option value="28">28 px</option>
            <option value="32">32 px</option>
          </select>
          <button type="button" onClick={() => command("removeFormat")}>Clear format</button>
        </div>
      )}
      <div
        ref={editorRef}
        className={`richSurface ${disabled ? "disabled" : ""}`}
        contentEditable={!disabled}
        suppressContentEditableWarning
        onInput={sync}
        dangerouslySetInnerHTML={{ __html: initialHtml }}
      />
      <input ref={hiddenRef} type="hidden" name={name} defaultValue={initialHtml} />
    </div>
  );
}
