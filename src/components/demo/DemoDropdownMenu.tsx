"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type DemoDropdownItem = {
  href: string;
  label: string;
  description: string;
};

export function DemoDropdownMenu({
  label,
  items,
  alignRight = false,
}: {
  label: string;
  items: DemoDropdownItem[];
  alignRight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const node = detailsRef.current;
      if (node && !node.contains(event.target as Node)) setOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <details
      ref={detailsRef}
      className="navMenu"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {label} <span aria-hidden="true">⌄</span>
      </summary>
      <div className={`navDropdown${alignRight ? " navDropdownRight" : ""}`}>
        {items.map((item) => (
          <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </Link>
        ))}
      </div>
    </details>
  );
}
