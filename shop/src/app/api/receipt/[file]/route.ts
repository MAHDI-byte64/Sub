import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { contentTypeOf, uploadPath } from "@/lib/uploads";

/** نمایش رسید پرداخت فقط برای صاحب سفارش یا مدیر */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const { file } = await params;
  const order = await db.order.findFirst({ where: { receiptFile: file } });
  if (!order) return new NextResponse("not found", { status: 404 });
  if (user.role !== "admin" && order.userId !== user.id) {
    return new NextResponse("forbidden", { status: 403 });
  }

  try {
    const buffer = await readFile(uploadPath(file));
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": contentTypeOf(file), "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}
