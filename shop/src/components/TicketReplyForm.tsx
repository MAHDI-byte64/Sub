"use client";

import { useActionState, useState } from "react";
import { closeTicketAction, replyTicketAction, type TicketState } from "@/app/actions/tickets";
import SubmitButton from "./SubmitButton";

export default function TicketReplyForm({
  ticketId,
  closed,
  initial = "؟",
  placeholder = "پاسخ خود را بنویسید…",
  cannedReplies = [],
  hint,
}: {
  ticketId: string;
  closed: boolean;
  initial?: string;
  placeholder?: string;
  cannedReplies?: string[];
  hint?: string;
}) {
  const [state, formAction] = useActionState<TicketState, FormData>(replyTicketAction, {});
  const [closeState, closeAction] = useActionState<TicketState, FormData>(closeTicketAction, {});
  const [body, setBody] = useState("");

  if (closed) {
    return (
      <div className="alert alert-info" style={{ marginTop: 16, marginBottom: 0 }}>
        🔒 این گفتگو بسته شده است. اگر باز هم سوالی دارید، تیکت جدیدی ثبت کنید.
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
            placeholder={placeholder}
            aria-label="متن پاسخ"
          />
          <div className="composer-actions">
            <span className="field-hint">{hint ?? "پاسخ شما بلافاصله برای طرف مقابل ارسال می‌شود."}</span>
            <div className="btn-row">
              <span className="field-hint">{body.length} کاراکتر</span>
              <SubmitButton className="btn btn-primary">ارسال پاسخ</SubmitButton>
            </div>
          </div>
        </div>
      </form>

      <form action={closeAction} style={{ marginTop: 12, textAlign: "start" }}>
        <input type="hidden" name="ticketId" value={ticketId} />
        <SubmitButton className="btn btn-sm btn-ghost" pendingText="…">
          🔒 بستن گفتگو
        </SubmitButton>
      </form>
    </>
  );
}
