"use client";

import { useState } from "react";
import { t, type Locale } from "@/lib/i18n";

export default function CopyButton({
  value,
  label,
  className = "btn btn-sm",
  locale = "fa",
}: {
  value: string;
  label?: string;
  className?: string;
  locale?: Locale;
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
      {copied ? t(locale, "card.copied") : (label ?? t(locale, "card.copy"))}
    </button>
  );
}
