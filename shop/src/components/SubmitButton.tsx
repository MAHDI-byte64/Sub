"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  children,
  className = "btn btn-primary",
  pendingText = "لطفاً صبر کنید…",
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} {...rest}>
      {pending ? pendingText : children}
    </button>
  );
}
