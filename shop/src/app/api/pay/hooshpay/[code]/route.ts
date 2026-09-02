import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { activeGateways, gatewayById, validHooshpaySignature, verifyWithGateway } from "@/lib/payments";
import { completePaidOrder } from "@/lib/orders";

/**
 * وب‌هوک هوش‌پی (`callback_url`).
 *
 * هوش‌پی به‌محض تأیید پرداخت، رویداد `payment.success` را با امضای
 * `X-HooshPay-Signature` می‌فرستد و انتظار پاسخ ۲۰۰ دارد؛ وگرنه چند بار دیگر
 * تلاش می‌کند. سرویس دقیقاً همان کاری را می‌کند که بازگشت کاربر انجام می‌دهد،
 * فقط زودتر — و باز هم تصمیم نهایی با تأیید سرور‌به‌سرور خود هوش‌پی گرفته می‌شود،
 * نه با محتوای همین درخواست.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const order = await db.order.findUnique({ where: { code } });
  if (!order) return NextResponse.json({ ok: false, error: "order not found" }, { status: 404 });
  if (order.status === "approved") return NextResponse.json({ ok: true, already: true });

  const gateway =
    (order.gatewayId ? await gatewayById(order.gatewayId) : null) ??
    (await activeGateways()).find((row) => row.driver === "hooshpay") ??
    null;
  if (!gateway) return NextResponse.json({ ok: false, error: "gateway not found" }, { status: 404 });

  // امضا فقط وقتی بررسی می‌شود که Secret تنظیم شده باشد؛ نبودنش جلوی تأیید
  // سرور‌به‌سرور را نمی‌گیرد، ولی امضای غلط یعنی درخواست جعلی است.
  const signature = req.headers.get("x-hooshpay-signature") ?? "";
  if (gateway.apiSecret && !validHooshpaySignature(payload, signature, gateway.apiSecret)) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  const ref = order.gatewayRef || String(payload.invoice ?? "");
  if (!ref) return NextResponse.json({ ok: false, error: "missing invoice" }, { status: 400 });

  const result = await verifyWithGateway(gateway, {
    ref,
    amount: order.payable,
    orderCode: order.code,
    params: {},
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.message }, { status: 202 });
  }

  try {
    await completePaidOrder(order.id, {
      gateway: gateway.driver,
      ref,
      bankRef: result.refId || String(payload.tracking_code ?? ""),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    // پول رسیده ولی تحویل نشده: به هوش‌پی «باشه» می‌گوییم و سفارش را برای مدیر
    // علامت می‌زنیم، وگرنه وب‌هوک بی‌جهت بارها تکرار می‌شود.
    await db.order.update({
      where: { id: order.id },
      data: {
        status: "pending_review",
        paidAt: new Date(),
        gateway: gateway.driver,
        gatewayRef: ref,
        bankRef: result.refId,
        adminNote: `پرداخت هوش‌پی موفق بود ولی تحویل خطا داد: ${(err as Error).message}`.slice(0, 300),
      },
    });
    return NextResponse.json({ ok: true, delivery: "manual" });
  }
}
