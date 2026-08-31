import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { resolveDiscount } from "@/app/actions/shop";
import { toman } from "@/lib/format";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: "ابتدا وارد حساب شوید." }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { code?: string; planId?: string };
  const plan = await db.plan.findFirst({ where: { id: String(body.planId || ""), isActive: true } });
  if (!plan) return NextResponse.json({ ok: false, message: "پلن نامعتبر است." }, { status: 400 });

  const result = await resolveDiscount(String(body.code || ""), plan.priceToman);
  if (!result) return NextResponse.json({ ok: false, message: "کد تخفیف را وارد کنید." });
  if ("error" in result) return NextResponse.json({ ok: false, message: result.error });

  const payable = Math.max(0, plan.priceToman - result.amount);
  return NextResponse.json({
    ok: true,
    message: `${result.label} اعمال شد. مبلغ قابل پرداخت: ${toman(payable)}`,
    payable,
    off: result.amount,
  });
}
