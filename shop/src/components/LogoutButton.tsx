"use client";

import { useTransition } from "react";
import { logoutAction } from "@/app/actions/auth";

export default function LogoutButton({ label = "خروج" }: { label?: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost"
      disabled={pending}
      onClick={() => start(() => void logoutAction())}
      title={label}
    >
      {pending ? "..." : label}
    </button>
  );
}
