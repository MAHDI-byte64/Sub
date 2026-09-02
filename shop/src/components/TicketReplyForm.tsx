"use client";

import { useActionState, useState } from "react";
import { closeTicketAction, replyTicketAction, type TicketState } from "@/app/actions/tickets";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

export default function TicketReplyForm({
  ticketId,
  closed,
  initial = "؟",
  placeholder,
  cannedReplies = [],
  hint,
  locale = "fa",
}: {
  ticketId: string;
  closed: boolean;
  initial?: string;
  placeholder?: string;
  cannedReplies?: string[];
  hint?: string;
  locale?: Locale;
}) {
  const tr = (key: string) => t(locale, key);
  const [state, formAction] = useActionState<TicketState, FormData>(replyTicketAction, {});
  const [closeState, closeAction] = useActionState<TicketState, FormData>(closeTicketAction, {});
  const [body, setBody] = useState("");

  if (closed) {
    return (
      <div className="alert alert-info" style={{ marginTop: 16, marginBottom: 0 }}>
        {tr("ticket.closedNote")}
      </div>
    );
  }

  return (
    <>
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {closeState.success ? <div className="alert alert-success">{closeState.success}</div> : null}

      <form action={formAction} className="composer">
        <span className="avatar avatar-sm">{initial}</span>
        <div className="composer-body">
          <input type="hidden" name="ticketId" value={ticketId} />

          {cannedReplies.length ? (
            <div className="subject-chips">
              {cannedReplies.map((reply, i) => (
                <button
                  type="button"
                  className="chip"
                  key={`${i}-${reply.slice(0, 12)}`}
                  onClick={() => setBody(reply)}
                  title={reply}
                >
                  {reply.length > 42 ? `${reply.slice(0, 42)}…` : reply}
                </button>
              ))}
            </div>
          ) : null}

          <textarea
            name="body"
            required
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={placeholder ?? tr("ticket.replyPlaceholder")}
            aria-label={tr("ticket.replyLabel")}
          />
          <div className="composer-actions">
            <span className="field-hint">{hint ?? tr("ticket.reply")}</span>
            <div className="btn-row">
              <span className="field-hint">
                {body.length} {tr("ticket.chars")}
              </span>
              <SubmitButton className="btn btn-primary">{tr("ticket.sendReply")}</SubmitButton>
            </div>
          </div>
        </div>
      </form>

      <form action={closeAction} style={{ marginTop: 12, textAlign: "start" }}>
        <input type="hidden" name="ticketId" value={ticketId} />
        <SubmitButton className="btn btn-sm btn-ghost" pendingText="…">
          {tr("ticket.closeThread")}
        </SubmitButton>
      </form>
    </>
  );
}
