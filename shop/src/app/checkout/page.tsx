import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { fmt } from "@/lib/format";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import { asBool, getSettings } from "@/lib/settings";
import { availableMethods } from "@/lib/payments";
import { checkCustom, customPrice, customRates, ratesReady } from "@/lib/pricing";
import CheckoutForm from "@/components/CheckoutForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "ثبت سفارش" };

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; renew?: string; service?: string; gb?: string }>;
}) {
  const { plan: planId, renew: renewId, service: addonServiceId, gb } = await searchParams;
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);
  if (!planId && !addonServiceId) redirect("/plans");

  const user = await getCurrentUser();
  if (!user) {
    const next = addonServiceId
      ? `/checkout?service=${addonServiceId}&gb=${gb ?? ""}`
      : `/checkout?plan=${planId}${renewId ? `&renew=${renewId}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  // مسیر «خرید حجم اضافه»: پلنی در کار نیست؛ قیمت از نرخ گیگ حساب می‌شود
  if (addonServiceId) {
    const settings = await getSettings();
    const rates = customRates(settings);
    const service = await db.service.findFirst({
      where: { id: addonServiceId, userId: user.id, resellerId: null },
      include: { panel: true, plan: true },
    });
    if (!service || !rates.addonEnabled || !ratesReady(rates)) notFound();

    const checked = checkCustom(rates, { gb }, "addon");
    if (!checked.ok) redirect(`/dashboard/services/${service.id}`);

    const amount = customPrice(rates, checked.gb, 0);
    const [wallet, methods] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: user.id }, select: { balance: true } }),
      availableMethods(amount, user),
    ]);
    const name = service.plan?.title ?? service.remark;

    return (
      <div className="container section" style={{ maxWidth: 900 }}>
        <div className="section-head">
          <h1>{tr("checkout.addonTitle")}</h1>
          <p>{tr("checkout.addonFor", { service: name })}</p>
        </div>

        <div className="grid grid-2">
          <div className="card">
            <div className="card-title">
              <h3>{tr("checkout.summary")}</h3>
              <span className="badge badge-info">{tr("checkout.addonStep")}</span>
            </div>
            <ul className="plan-features">
              <li>
                {f.num(checked.gb)} {tr("service.gb")}
              </li>
              <li>
                {service.panel.flag} {service.panel.location}
              </li>
              <li>{tr("checkout.addonNote")}</li>
            </ul>
            <div className="plan-price">{f.money(amount)}</div>
            <Link className="btn btn-sm btn-ghost" href={`/dashboard/services/${service.id}`}>
              {tr("order.viewService")}
            </Link>
          </div>

          <div className="card">
            <div className="card-title">
              <h3>{tr("checkout.stepPay")}</h3>
            </div>
            <CheckoutForm
              locale={locale}
              plan={{
                id: "",
                title: `${f.num(checked.gb)} ${tr("service.gb")}`,
                priceToman: amount,
                priceLabel: f.money(amount),
              }}
              addon={{ serviceId: service.id, gb: checked.gb }}
              panels={[]}
              renew={null}
              wallet={{ enabled: asBool(settings.wallet_enabled), balance: wallet.balance }}
              methods={{
                card: methods.card,
                crypto: methods.crypto,
                gateways: methods.gateways.map((g) => ({ id: g.id, label: g.label })),
              }}
            />
          </div>
        </div>
      </div>
    );
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

  const methods = await availableMethods(plan.priceToman, user);

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
            methods={{
              card: methods.card,
              crypto: methods.crypto,
              gateways: methods.gateways.map((g) => ({ id: g.id, label: g.label })),
            }}
          />
        </div>
      </div>
    </div>
  );
}
