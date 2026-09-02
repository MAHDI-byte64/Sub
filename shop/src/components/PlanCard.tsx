import Link from "next/link";
import type { Panel, Plan } from "@prisma/client";
import { fmt } from "@/lib/format";
import { t, type Locale } from "@/lib/i18n";

export default function PlanCard({
  plan,
  href,
  locale = "fa",
}: {
  plan: Plan & { panels?: Pick<Panel, "id" | "flag" | "location">[] };
  href?: string;
  locale?: Locale;
}) {
  const f = fmt(locale);
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);
  const separator = locale === "fa" ? "، " : ", ";

  return (
    <article className={`plan${plan.isPopular ? " popular" : ""}`}>
      {plan.isPopular ? <span className="plan-badge">{tr("planCard.popular")}</span> : null}
      <h3>{plan.title}</h3>
      {plan.subtitle ? <small>{plan.subtitle}</small> : null}
      <div className="plan-price">
        {f.money(plan.priceToman, false)} <span>{tr("common.toman")}</span>
      </div>
      {plan.volumeGb > 0 && plan.priceToman > 0 ? (
        <span className="plan-value">
          {tr("planCard.perGb", { price: f.money(Math.round(plan.priceToman / plan.volumeGb)) })}
        </span>
      ) : null}
      <ul className="plan-features">
        <li>{f.volume(plan.volumeGb)}</li>
        <li>{f.days(plan.days)}</li>
        <li>{f.devices(plan.deviceLimit)}</li>
        <li>{tr("planCard.allDevices")}</li>
        {plan.panels?.length ? (
          <li>{plan.panels.map((p) => `${p.flag} ${p.location}`).join(separator)}</li>
        ) : null}
      </ul>
      <Link
        className={`btn btn-block${plan.isPopular ? " btn-primary" : ""}`}
        href={href ?? `/checkout?plan=${plan.id}`}
      >
        {tr("common.buy")}
      </Link>
    </article>
  );
}
