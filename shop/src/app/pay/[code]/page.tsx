import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { activeGateways, gatewayById, startWithGateway } from "@/lib/payments";
import { siteUrl } from "@/lib/site";
import { toman } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "انتقال به درگاه پرداخت" };

/**
 * شروع پرداخت آنلاین: کد پیگیری از درگاه گرفته و کاربر به صفحهٔ بانک فرستاده می‌شود.
 * اگر چیزی درست نبود، به‌جای ریدایرکت، خطای خوانا نمایش داده می‌شود.
 */
export default async function PayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requireUser(`/pay/${code}`);

  const order = await db.order.findFirst({
    where: { code, userId: user.id },
    include: { plan: true },
  });

  const settings = await getSettings();

  // درگاهی که موقع ثبت سفارش انتخاب شده؛ اگر نبود، اولین درگاه فعالِ مناسب
  const chosen = order?.gatewayId ? await gatewayById(order.gatewayId) : null;
  const fallback = order && !chosen ? (await activeGateways(order.payable))[0] : null;
  const gateway = chosen ?? fallback ?? null;

  const problem = !order
    ? "این سفارش پیدا نشد."
    : order.status === "approved"
      ? "این سفارش قبلاً پرداخت و تکمیل شده است."
      : order.status === "canceled"
        ? "این سفارش لغو شده است."
        : !gateway
          ? "پرداخت آنلاین در حال حاضر فعال نیست. از روش‌های دیگر استفاده کنید."
          : gateway.minAmount > 0 && order.payable < gateway.minAmount
            ? `حداقل مبلغ پرداخت آنلاین ${toman(gateway.minAmount)} است.`
            : gateway.maxAmount > 0 && order.payable > gateway.maxAmount
              ? `حداکثر مبلغ پرداخت با این درگاه ${toman(gateway.maxAmount)} است.`
              : null;

  if (order && gateway && !problem) {
    const base = await siteUrl();
    try {
      const started = await startWithGateway(gateway, {
        amount: order.payable,
        orderCode: order.code,
        description:
          order.kind === "topup"
            ? `شارژ کیف پول ${settings.site_name}`
            : `${settings.site_name} | ${order.plan?.title ?? "خرید سرویس"}`,
        callbackUrl: `${base}/api/pay/callback/${order.code}`,
        email: user.email,
      });

      await db.order.update({
        where: { id: order.id },
        data: {
          payMethod: "online",
          status: "awaiting_payment",
          gateway: gateway.driver,
          gatewayId: gateway.id,
          gatewayRef: started.ref,
        },
      });

      redirect(started.payUrl);
    } catch (err) {
      // redirect داخل Next با پرتاب خطا کار می‌کند؛ آن را دوباره پرتاب می‌کنیم
      if ((err as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw err;

      return (
        <div className="container section" style={{ maxWidth: 620 }}>
          <div className="card center">
            <h1 style={{ fontSize: "1.3rem", marginBottom: 10 }}>اتصال به درگاه انجام نشد</h1>
            <p className="dim" style={{ lineHeight: 2.1 }}>
              {(err as Error).message}
            </p>
            <div className="btn-row" style={{ justifyContent: "center", marginTop: 16 }}>
              <Link className="btn btn-primary" href={`/dashboard/orders/${code}`}>
                بازگشت به سفارش
              </Link>
              <Link className="btn" href="/dashboard/tickets">
                تماس با پشتیبانی
              </Link>
            </div>
          </div>
        </div>
      );
    }
  }

  return (
    <div className="container section" style={{ maxWidth: 620 }}>
      <div className="card center">
        <h1 style={{ fontSize: "1.3rem", marginBottom: 10 }}>پرداخت ممکن نیست</h1>
        <p className="dim" style={{ lineHeight: 2.1 }}>
          {problem}
        </p>
        <div className="btn-row" style={{ justifyContent: "center", marginTop: 16 }}>
          <Link className="btn btn-primary" href="/dashboard/orders">
            سفارش‌های من
          </Link>
        </div>
      </div>
    </div>
  );
}
