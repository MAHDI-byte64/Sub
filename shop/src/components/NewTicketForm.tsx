"use client";

import { useActionState, useState } from "react";
import { createTicketAction, type TicketState } from "@/app/actions/tickets";
import { t, type Locale } from "@/lib/i18n";
import SubmitButton from "./SubmitButton";

const SUGGESTION_KEYS = ["s1", "s2", "s3", "s4", "s5"];

export default function NewTicketForm({
  services = [],
  locale = "fa",
}: {
  services?: { id: string; label: string }[];
  locale?: Locale;
}) {
  const [state, formAction] = useActionState<TicketState, FormData>(createTicketAction, {});
  const tr = (key: string) => t(locale, key);
  const suggestions = SUGGESTION_KEYS.map((key) => tr(`ticket.${key}`));
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  return (
    <form action={formAction} className="form">
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}

      <div className="field">
        <label htmlFor="subject">{tr("ticket.subject")}</label>
        <div className="subject-chips">
          {suggestions.map((s) => (
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
          placeholder={tr("ticket.subjectPlaceholder")}
        />
      </div>

      {services.length ? (
        <div className="field">
          <label htmlFor="serviceId">{tr("ticket.aboutService")}</label>
          <select id="serviceId" name="serviceId" defaultValue="">
            <option value="">{tr("ticket.noService")}</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="field-hint">{tr("ticket.serviceHint")}</span>
        </div>
      ) : null}

      <div className="field">
        <label htmlFor="body">{tr("ticket.body")}</label>
        <textarea
          id="body"
          name="body"
          required
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={tr("ticket.bodyPlaceholder")}
        />
        <div className="composer-actions">
          <span className="field-hint">{tr("ticket.bodyHint")}</span>
          <span className="field-hint">
            {body.length} {tr("ticket.chars")}
          </span>
        </div>
      </div>

      <div className="field">
        <label htmlFor="attachment">{tr("ticket.attach")}</label>
        <input
          id="attachment"
          name="attachment"
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
        />
        <span className="field-hint">{tr("ticket.attachHint")}</span>
      </div>

      <SubmitButton className="btn btn-primary btn-lg">{tr("ticket.send")}</SubmitButton>
    </form>
  );
}
