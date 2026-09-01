"use client";

import { useState } from "react";

export default function CopyButton({
  value,
  label = "کپی",
  className = "btn btn-sm",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = value;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button type="button" className={className} onClick={copy}>
      {copied ? "✓ کپی شد" : label}
    </button>
  );
}
