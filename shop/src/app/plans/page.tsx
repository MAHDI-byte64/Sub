import Link from "next/link";
import { db } from "@/lib/db";
import { asBool, getSettings } from "@/lib/settings";
import { faNum } from "@/lib/format";
import PlanCard from "@/components/PlanCard";

export const dynamic = "force-dynamic";
export const metadata = { title: "تعرفه‌ها" };

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ renew?: string }>;
}) {
  const { renew } = await searchParams;
  const [plans, panels, settings] = await Promise.all([
    db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    db.panel.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
    getSettings(),
  ]);

  return (
    <div className="container section">
      <div className="section-head">
        <h1>{renew ? "تمدید سرویس" : "تعرفه‌ها"}</h1>
        <p>
          {renew
            ? "پلنی را که می‌خواهید به سرویس فعلی اضافه شود انتخاب کنید."
            : "پلن مناسب خود را انتخاب کنید. همه پلن‌ها روی تمام لوکیشن‌ها فعال هستند."}
        </p>
      </div>

      {asBool(settings.trial_enabled) ? (
        <div className="alert alert-info">
          🎁 هنوز مطمئن نیستید؟ با ثبت‌نام رایگان می‌توانید یک اکانت تست {faNum(settings.trial_volume_gb)}{" "}
          گیگابایتی {faNum(settings.trial_days)} روزه دریافت کنید. <Link href="/dashboard">دریافت تست رایگان</Link>
        </div>
      ) : null}

      {plans.length ? (
        <div className="grid grid-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              href={`/checkout?plan=${plan.id}${renew ? `&renew=${renew}` : ""}`}
            />
          ))}
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🗂️</div>
          فعلاً پلنی برای فروش تعریف نشده است.
        </div>
      )}

      {panels.length ? (
        <div className="card" style={{ marginTop: 28 }}>
          <div className="card-title">
            <h3>لوکیشن‌های در دسترس</h3>
          </div>
          <div className="btn-row">
            {panels.map((p) => (
              <span className="pill" key={p.id}>
                {p.flag} {p.location}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
