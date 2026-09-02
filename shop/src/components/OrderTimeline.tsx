import { faDate, relativeTime } from "@/lib/format";

export type TimelineStep = {
  title: string;
  hint?: string;
  at?: Date | null;
  state: "done" | "active" | "pending" | "failed";
  icon?: string;
};

/** تایم‌لاین عمودی مراحل سفارش با زمان هر مرحله */
export default function OrderTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="otl">
      {steps.map((step, i) => (
        <li className={`otl-item is-${step.state}`} key={`${step.title}-${i}`}>
          <span className="otl-dot">
            {step.state === "done" ? "✓" : step.state === "failed" ? "✕" : (step.icon ?? i + 1)}
          </span>
          <div className="otl-body">
            <b>{step.title}</b>
            {step.hint ? <span className="otl-hint">{step.hint}</span> : null}
            {step.at ? (
              <span className="otl-time" title={faDate(step.at, true)}>
                {relativeTime(step.at)} · {faDate(step.at, true)}
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
