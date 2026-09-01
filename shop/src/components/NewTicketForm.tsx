"use client";

import { useActionState, useState } from "react";
import { createTicketAction, type TicketState } from "@/app/actions/tickets";
import SubmitButton from "./SubmitButton";

const SUGGESTIONS = [
  "سرعت سرویس کم شده",
  "اتصال برقرار نمی‌شود",
  "درخواست تعویض سرور",
  "سوال دربارهٔ تمدید",
  "مشکل در پرداخت",
];

export default function NewTicketForm() {
  const [state, formAction] = useActionState<TicketState, FormData>(createTicketAction, {});
  const [subject, setSubject] = useState("");

  return (
    <form action={formAction} className="form">
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}

      <div className="field">
        <label htmlFor="subject">موضوع</label>
        <div className="subject-chips">
          {SUGGESTIONS.map((s) => (
            <button type="button" className="btn btn-sm" key={s} onClick={() => setSubject(s)}>
              {s}
            </button>
          ))}
        </div>
        <input
          id="subject"
          name="subject"
          required
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="موضوع را بنویسید یا از پیشنهادهای بالا انتخاب کنید"
        />
      </div>

      <div className="field">
        <label htmlFor="body">شرح مشکل</label>
        <textarea
          id="body"
          name="body"
          required
          placeholder="نام سرویس، برنامه‌ای که استفاده می‌کنید و شرح دقیق مشکل را بنویسید تا سریع‌تر حل شود."
        />
        <span className="field-hint">
          هرچه جزئیات بیشتری بنویسید، پشتیبانی سریع‌تر مشکل را پیدا می‌کند.
        </span>
      </div>

      <SubmitButton className="btn btn-primary">ارسال تیکت</SubmitButton>
    </form>
  );
}
