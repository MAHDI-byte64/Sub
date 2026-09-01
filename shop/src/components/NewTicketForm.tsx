"use client";

import { useActionState } from "react";
import { createTicketAction, type TicketState } from "@/app/actions/tickets";
import SubmitButton from "./SubmitButton";

export default function NewTicketForm() {
  const [state, formAction] = useActionState<TicketState, FormData>(createTicketAction, {});
  return (
    <form action={formAction} className="form">
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      <div className="field">
        <label htmlFor="subject">موضوع</label>
        <input id="subject" name="subject" required placeholder="مثلاً: سرعت سرویس کم شده" />
      </div>
      <div className="field">
        <label htmlFor="body">شرح مشکل</label>
        <textarea id="body" name="body" required placeholder="لطفاً نام سرویس، برنامه مورد استفاده و شرح دقیق مشکل را بنویسید." />
      </div>
      <SubmitButton className="btn btn-primary">ارسال تیکت</SubmitButton>
    </form>
  );
}
