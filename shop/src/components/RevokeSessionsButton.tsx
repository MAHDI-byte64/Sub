"use client";

import { useActionState } from "react";
import { revokeOtherSessionsAction, type AuthState } from "@/app/actions/auth";
import SubmitButton from "./SubmitButton";

export default function RevokeSessionsButton({ count }: { count: number }) {
  const [state, formAction] = useActionState<AuthState & { success?: string }, FormData>(
    async (prev) => revokeOtherSessionsAction(prev),
    {},
  );

  return (
    <form action={formAction}>
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}
      <SubmitButton className="btn btn-sm btn-danger" pendingText="…">
        خروج از {count > 0 ? `${count} دستگاه دیگر` : "سایر دستگاه‌ها"}
      </SubmitButton>
    </form>
  );
}
