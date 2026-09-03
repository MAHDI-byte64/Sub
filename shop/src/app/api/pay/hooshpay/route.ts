import type { NextRequest } from "next/server";
import { handleHooshpayWebhook } from "@/lib/hooshpay";

/**
 * «آدرس وب‌هوک پیش‌فرض» پنل هوش‌پی: بدون کد سفارش می‌آید و سفارش از روی
 * `order_id` داخل بدنه پیدا می‌شود.
 */
export async function POST(req: NextRequest) {
  return handleHooshpayWebhook(req);
}
