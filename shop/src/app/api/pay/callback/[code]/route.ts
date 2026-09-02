import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { callbackRefParam, gatewayConfig, verifyPayment } from "@/lib/gateway";
import { completePaidOrder, failOrder } from "@/lib/orders";
import { siteUrl } from "@/lib/site";

/**
 * بازگشت از درگاه پرداخت.
 *
 * درگاه‌ها یا با GET برمی‌گردانند (زرین‌پال، زیبال) یا با POST (آی‌دی‌پی)، پس هر دو
 * پشتیبانی می‌شود. تصمیم نهایی هرگز به پارامترهای بازگشتی تکیه نمی‌کند: مبلغ و
 * وضعیت با یک درخواست «تأیید» مستقیم از خود درگاه گرفته می‌شود.
 */
async function handle(req: NextRequest, code: string): Promise<NextResponse> {
  const base = await siteUrl();
  const back = (query: string) => NextResponse.redirect(`${base}/dashboard/orders/${code}?${query}`, 303);

  const order = await db.order.findUnique({ where: { code } });
  if (!order) return NextResponse.redirect(`${base}/dashboard/orders`, 303);
  if (order.status === "approved") return back("paid=1");

  // پارامترهای بازگشتی از query و body جمع می‌شوند
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  if (req.method === "POST") {
    try {
      const contentType = req.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const body = (await req.json()) as Record<string, unknown>;
        for (const [key, value] of Object.entries(body)) params[key] = String(value);
      } else {
        const form = await req.formData();
        form.forEach((value, key) => {
          params[key] = String(value);
        });
      }
    } catch {
      /* بدنهٔ خالی یا نامعتبر */
    }
  }

  const settings = await getSettings();
  const cfg = gatewayConfig(settings);
  const driverId = order.gateway || cfg.driver;
  const refFromParams = callbackRefParam(driverId, cfg.custom)
    .map((key) => params[key])
    .find(Boolean);
  const ref = order.gatewayRef || refFromParams || "";

  if (!ref) {
    await failOrder(order.id, "کد پیگیری پرداخت از درگاه دریافت نشد.");
    return back("payerror=" + encodeURIComponent("کد پیگیری پرداخت دریافت نشد."));
  }

  const result = await verifyPayment({
    driver: driverId,
    ref,
    amount: order.payable,
    orderCode: order.code,
    params,
  });

  if (!result.ok) {
    await failOrder(order.id, `پرداخت ناموفق: ${result.message}`);
    return back("payerror=" + encodeURIComponent(result.message));
  }

  try {
    const completed = await completePaidOrder(order.id, {
      gateway: driverId,
      ref,
      bankRef: result.refId,
    });
    return completed.kind === "topup"
      ? NextResponse.redirect(`${base}/dashboard/wallet?paid=1`, 303)
      : back("paid=1");
  } catch (err) {
    // پول گرفته شده ولی تحویل نشده: سفارش برای بررسی مدیر علامت می‌خورد
    await db.order.update({
      where: { id: order.id },
      data: {
        status: "pending_review",
        paidAt: new Date(),
        gateway: driverId,
        gatewayRef: ref,
        bankRef: result.refId,
        adminNote: `پرداخت آنلاین موفق بود ولی تحویل خطا داد: ${(err as Error).message}`.slice(0, 300),
      },
    });
    return back(
      "payerror=" +
        encodeURIComponent(
          "پرداخت شما موفق بود اما تحویل خودکار انجام نشد؛ پشتیبانی همین حالا در جریان قرار گرفت.",
        ),
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  return handle(req, code);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  return handle(req, code);
}
