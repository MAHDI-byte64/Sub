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

export default function NewTicketForm({
  services = [],
}: {
  services?: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState<TicketState, FormData>(createTicketAction, {});
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <form action={formAction} className="form">
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}

      <div className="field">
        <label htmlFor="subject">موضوع</label>
        <div className="subject-chips">
          {SUGGESTIONS.map((s) => (
            <button
              type="button"
              className={`chip${subject === s ? " is-active" : ""}`}
              key={s}
              onClick={() => setSubject(s)}
            >
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

      {services.length ? (
        <div className="field">
          <label htmlFor="serviceId">این تیکت دربارهٔ کدام سرویس است؟</label>
          <select id="serviceId" name="serviceId" defaultValue="">
            <option value="">مربوط به سرویس خاصی نیست</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="field-hint">
            با انتخاب سرویس، پشتیبانی مصرف و وضعیت همان سرویس را کنار گفتگو می‌بیند و سریع‌تر کمک می‌کند.
          </span>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="body">شرح مشکل</label>
        <textarea
          id="body"
          name="body"
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="برنامه‌ای که استفاده می‌کنید، زمان بروز مشکل و هر چیزی که کمک می‌کند سریع‌تر پیدایش کنیم."
        />
        <div className="composer-actions">
          <span className="field-hint">هرچه جزئیات بیشتری بنویسید، پاسخ دقیق‌تر و سریع‌تر است.</span>
          <span className="field-hint">{body.length} کاراکتر</span>
        </div>
      </div>

      <SubmitButton className="btn btn-primary btn-lg">ارسال تیکت</SubmitButton>
    </form>
  );
}
