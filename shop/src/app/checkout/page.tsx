import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import { asBool, getSettings } from "@/lib/settings";
import { gatewayMin, gatewayReady } from "@/lib/gateway";
import CheckoutForm from "@/components/CheckoutForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "ثبت سفارش" };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; renew?: string }>;
}) {
  const { plan: planId, renew: renewId } = await searchParams;
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);
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
  const [allPanels, renewService, settings, wallet] = await Promise.all([
    db.panel.findMany({
      where: { isActive: true, ...(allowedIds.length ? { id: { in: allowedIds } } : {}) },
      orderBy: { sortOrder: "asc" },
    }),
    renewId ? db.service.findFirst({ where: { id: renewId, userId: user.id } }) : Promise.resolve(null),
    getSettings(),
    db.user.findUniqueOrThrow({ where: { id: user.id }, select: { balance: true } }),
  ]);

  // سروری که پایش خرابش تشخیص داده به کاربر پیشنهاد نمی‌شود
  const healthyPanels = allPanels.filter((p) => !p.autoDisabled);
  const panels = healthyPanels.length ? healthyPanels : allPanels;

  return (
    <div className="container section" style={{ maxWidth: 900 }}>
      <div className="section-head">
        <h1>{renewService ? tr("checkout.renewTitle") : tr("checkout.title")}</h1>
        <p>{tr("checkout.subtitle")}</p>
      </div>

      <div className="steps-bar">
        <div className="step-item is-done">
          <i>✓</i>
          <div>
            <b>{tr("checkout.stepPlan")}</b>
            <small>{plan.title}</small>
          </div>
        </div>
        <div className="step-item is-active">
          <i>{f.num(2)}</i>
          <div>
            <b>{tr("checkout.stepOrder")}</b>
            <small>{tr("checkout.selectLocation")}</small>
          </div>
        </div>
        <div className="step-item">
          <i>{f.num(3)}</i>
          <div>
            <b>{tr("checkout.stepPay")}</b>
            <small>{tr("checkout.stepDeliver")}</small>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <div className="card-title">
            <h3>{tr("checkout.summary")}</h3>
            <span className="badge badge-info">{plan.title}</span>
          </div>
          <ul className="plan-features">
            <li>{f.volume(plan.volumeGb)}</li>
            <li>{f.days(plan.days)}</li>
            <li>{f.devices(plan.deviceLimit)}</li>
          </ul>
          <div className="plan-price">{f.money(plan.priceToman)}</div>
          <Link className="btn btn-sm btn-ghost" href="/plans">
            {tr("plans.title")}
          </Link>
        </div>

        <div className="card">
          <div className="card-title">
            <h3>{tr("checkout.stepOrder")}</h3>
          </div>
          <CheckoutForm
            locale={locale}
            plan={{
              id: plan.id,
              title: plan.title,
              priceToman: plan.priceToman,
              priceLabel: f.money(plan.priceToman),
            }}
            panels={panels.map((p) => ({ id: p.id, flag: p.flag, location: p.location }))}
            renew={renewService ? { id: renewService.id, remark: renewService.remark } : null}
            wallet={{ enabled: asBool(settings.wallet_enabled), balance: wallet.balance }}
            online={{ enabled: gatewayReady(settings), min: gatewayMin(settings) }}
          />
        </div>
      </div>
    </div>
  );
}
