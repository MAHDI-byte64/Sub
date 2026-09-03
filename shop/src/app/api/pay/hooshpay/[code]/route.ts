import type { NextRequest } from "next/server";
import { handleHooshpayWebhook } from "@/lib/hooshpay";

/** وب‌هوک هوش‌پی برای یک سفارش مشخص (آدرسی که روی هر فاکتور فرستاده می‌شود) */
export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  return handleHooshpayWebhook(req, code);
}
