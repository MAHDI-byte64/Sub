"use client";

import { useActionState } from "react";
import { revokeOtherSessionsAction, type AuthState } from "@/app/actions/auth";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

export default function RevokeSessionsButton({ count, locale = "fa" }: { count: number; locale?: Locale }) {
  const [state, formAction] = useActionState<AuthState & { success?: string }, FormData>(
    async (prev) => revokeOtherSessionsAction(prev),
    {},
  );

  return (
    <form action={formAction}>
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}
      <SubmitButton className="btn btn-sm btn-danger" pendingText="…">
        {count > 0 ? t(locale, "profile.signOutOthers", { count }) : t(locale, "profile.signOutAll")}
      </SubmitButton>
    </form>
  );
}
