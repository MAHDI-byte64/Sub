"use client";

import { useActionState } from "react";
import { closeTicketAction, replyTicketAction, type TicketState } from "@/app/actions/tickets";
import SubmitButton from "./SubmitButton";

export default function TicketReplyForm({ ticketId, closed }: { ticketId: string; closed: boolean }) {
  const [state, formAction] = useActionState<TicketState, FormData>(replyTicketAction, {});
  const [closeState, closeAction] = useActionState<TicketState, FormData>(closeTicketAction, {});

  if (closed) {
    return <div className="alert alert-info">این تیکت بسته شده است. در صورت نیاز تیکت جدیدی ثبت کنید.</div>;
  }

  return (
    <>
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {closeState.success ? <div className="alert alert-success">{closeState.success}</div> : null}
      <form action={formAction} className="form">
        <input type="hidden" name="ticketId" value={ticketId} />
        <div className="field">
          <label htmlFor="body">پاسخ شما</label>
          <textarea id="body" name="body" required placeholder="پیام خود را بنویسید…" />
        </div>
        <div className="btn-row">
          <SubmitButton className="btn btn-primary">ارسال پاسخ</SubmitButton>
        </div>
      </form>
      <form action={closeAction} style={{ marginTop: 10 }}>
        <input type="hidden" name="ticketId" value={ticketId} />
        <SubmitButton className="btn btn-sm btn-ghost" pendingText="…">
          بستن تیکت
        </SubmitButton>
      </form>
    </>
  );
}
