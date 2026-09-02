import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { logAdmin } from "@/lib/adminlog";

/** خروجی CSV برای سفارش‌ها، سرویس‌ها و کاربران */
function toCsv(rows: Record<string, string | number>[]): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ].join("\n");
}

const iso = (date: Date | null | undefined) => (date ? date.toISOString() : "");

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new NextResponse("forbidden", { status: 403 });

  const { kind } = await params;
  let rows: Record<string, string | number>[] = [];

  if (kind === "orders") {
    const orders = await db.order.findMany({
      include: { user: true, plan: true, panel: true },
      orderBy: { createdAt: "desc" },
    });
    rows = orders.map((o) => ({
      code: o.code,
      email: o.user.email,
      plan: o.plan.title,
      panel: o.panel?.location ?? "",
      amount: o.amount,
      discount: o.discountAmount,
      payable: o.payable,
      status: o.status,
      receiptRef: o.receiptRef ?? "",
      createdAt: iso(o.createdAt),
      reviewedAt: iso(o.reviewedAt),
    }));
  } else if (kind === "services") {
    const services = await db.service.findMany({
      include: { user: true, panel: true, plan: true },
      orderBy: { createdAt: "desc" },
    });
    rows = services.map((s) => ({
      email: s.user.email,
      client: s.clientEmail,
      plan: s.plan?.title ?? (s.isTrial ? "trial" : ""),
      panel: s.panel.location,
      inbound: s.inboundId,
      usedBytes: Math.round(s.usedBytes),
      totalBytes: Math.round(s.totalBytes),
      status: s.status,
      expiresAt: iso(s.expiresAt),
      createdAt: iso(s.createdAt),
      subId: s.subId,
    }));
  } else if (kind === "users") {
    const users = await db.user.findMany({
      include: { _count: { select: { orders: true, services: true, tickets: true } } },
      orderBy: { createdAt: "desc" },
    });
    rows = users.map((u) => ({
      email: u.email,
      name: u.name ?? "",
      role: u.role,
      blocked: u.isBlocked ? "yes" : "no",
      orders: u._count.orders,
      services: u._count.services,
      tickets: u._count.tickets,
      trialUsedAt: iso(u.trialUsedAt),
      createdAt: iso(u.createdAt),
    }));
  } else {
    return new NextResponse("unknown export", { status: 400 });
  }

  await logAdmin("backup_downloaded", `${kind}.csv`, `${rows.length} ردیف`);

  // BOM تا اکسل فارسی را درست نشان دهد
  const csv = `﻿${toCsv(rows)}`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="fandogh-${kind}-${Date.now()}.csv"`,
    },
  });
}
