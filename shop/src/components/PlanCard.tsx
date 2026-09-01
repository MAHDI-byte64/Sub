import Link from "next/link";
import type { Plan } from "@prisma/client";
import { deviceLabel, planDaysLabel, planVolumeLabel, toman } from "@/lib/format";

export default function PlanCard({ plan, href }: { plan: Plan; href?: string }) {
  return (
    <article className={`plan${plan.isPopular ? " popular" : ""}`}>
      {plan.isPopular ? <span className="plan-badge">پرفروش‌ترین</span> : null}
      <h3>{plan.title}</h3>
      {plan.subtitle ? <small>{plan.subtitle}</small> : null}
      <div className="plan-price">
        {toman(plan.priceToman, false)} <span>تومان</span>
      </div>
      <ul className="plan-features">
        <li>{planVolumeLabel(plan.volumeGb)}</li>
        <li>{planDaysLabel(plan.days)}</li>
        <li>{deviceLabel(plan.deviceLimit)}</li>
        <li>پشتیبانی از همه دستگاه‌ها</li>
      </ul>
      <Link
        className={`btn btn-block${plan.isPopular ? " btn-primary" : ""}`}
        href={href ?? `/checkout?plan=${plan.id}`}
      >
        خرید این پلن
      </Link>
    </article>
  );
}
