"use client";

import { useActionState } from "react";
import SubmitButton from "./SubmitButton";

export type FormState = { error?: string; success?: string };
type ServerAction = (prev: FormState, formData: FormData) => Promise<FormState>;

/** فرم عمومی برای اکشن‌های سرور با نمایش پیام موفقیت/خطا */
export default function ActionForm({
  action,
  children,
  submitLabel = "ذخیره",
  buttonClass = "btn btn-primary",
  className = "form",
  confirm,
  inline = false,
}: {
  action: ServerAction;
  children?: React.ReactNode;
  submitLabel?: string;
  buttonClass?: string;
  className?: string;
  confirm?: string;
  inline?: boolean;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  return (
    <form
      action={formAction}
      className={className}
      style={inline ? { display: "inline-block" } : undefined}
      onSubmit={
        confirm
          ? (event) => {
              if (!window.confirm(confirm)) event.preventDefault();
            }
          : undefined
      }
    >
      {state.error ? <div className="alert alert-error">{state.error}</div> : null}
      {state.success ? <div className="alert alert-success">{state.success}</div> : null}
      {children}
      <SubmitButton className={buttonClass}>{submitLabel}</SubmitButton>
    </form>
  );
}
