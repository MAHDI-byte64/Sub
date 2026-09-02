import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { deviceLabel, planDaysLabel, planVolumeLabel, toman } from "@/lib/format";
import { asBool, getSettings } from "@/lib/settings";
import CheckoutForm from "@/components/CheckoutForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "ثبت سفارش" };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; renew?: string }>;
}) {
  const { plan: planId, renew: renewId } = await searchParams;
  if (!planId) redirect("/plans");

  const user = await getCurrentUser();
  if (!user) {
    const next = `/checkout?plan=${planId}${renewId ? `&renew=${renewId}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const plan = await db.plan.findFirst({
    where: { id: planId, isActive: true },
    include: { panels: true },
  });
  if (!plan) notFound();

  const allowedIds = plan.panels.map((p) => p.id);
  const [panels, renewService, settings, wallet] = await Promise.all([
    db.panel.findMany({
      where: { isActive: true, ...(allowedIds.length ? { id: { in: allowedIds } } : {}) },
      orderBy: { sortOrder: "asc" },
    }),
    renewId ? db.service.findFirst({ where: { id: renewId, userId: user.id } }) : Promise.resolve(null),
    getSettings(),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { balance: true } }),
  ]);

  return (
    <div className="container section" style={{ maxWidth: 900 }}>
      <div className="section-head">
        <h1>{renewService ? "تمدید سرویس" : "ثبت سفارش"}</h1>
        <p>یک قدم تا فعال‌سازی سرویس شما.</p>
      </div>

      <div className="steps-bar">
        <div className="step-item is-done">
          <i>✓</i>
          <div>
            <b>انتخاب پلن</b>
            <small>{plan.title}</small>
          </div>
        </div>
        <div className="step-item is-active">
          <i>۲</i>
          <div>
            <b>ثبت سفارش</b>
            <small>لوکیشن و کد تخفیف</small>
          </div>
        </div>
        <div className="step-item">
          <i>۳</i>
          <div>
            <b>پرداخت و تحویل</b>
            <small>کارت‌به‌کارت</small>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">
            <h3>خلاصه سفارش</h3>
            <span className="badge badge-info">{plan.title}</span>
          </div>
          <ul className="plan-features">
            <li>{planVolumeLabel(plan.volumeGb)}</li>
            <li>{planDaysLabel(plan.days)}</li>
            <li>{deviceLabel(plan.deviceLimit)}</li>
          </ul>
          <div className="plan-price">{toman(plan.priceToman)}</div>
          <Link className="btn btn-sm btn-ghost" href="/plans">
            تغییر پلن
          </Link>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>تکمیل خرید</h3>
          </div>
          <CheckoutForm
            plan={{ id: plan.id, title: plan.title, priceToman: plan.priceToman, priceLabel: toman(plan.priceToman) }}
            panels={panels.map((p) => ({ id: p.id, flag: p.flag, location: p.location }))}
            renew={renewService ? { id: renewService.id, remark: renewService.remark } : null}
            wallet={{ enabled: asBool(settings.wallet_enabled), balance: wallet.balance }}
          />
        </div>
      </div>
    </div>
  );
}
