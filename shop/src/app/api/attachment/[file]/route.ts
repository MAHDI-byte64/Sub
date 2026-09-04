import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { contentTypeOf, uploadPath } from "@/lib/uploads";

/**
 * نمایش پیوست تیکت.
 *
 * فایل فقط برای صاحب همان تیکت و پشتیبانی باز می‌شود؛ نام فایل هم باید واقعاً
 * پیوست یکی از پیام‌ها باشد، پس با حدس‌زدن نام نمی‌شود به فایل دیگری رسید.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });

  const { file } = await params;
  const message = await db.ticketMessage.findFirst({
    where: { attachment: file },
    include: { ticket: { select: { userId: true } } },
  });
  if (!message) return new NextResponse("not found", { status: 404 });
  if (!isStaff(user.role) && message.ticket.userId !== user.id) {
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
