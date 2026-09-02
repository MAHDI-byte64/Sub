import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logAdmin } from "@/lib/adminlog";

/** دانلود فایل دیتابیس برای پشتیبان‌گیری (فقط مدیر) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new NextResponse("forbidden", { status: 403 });

  const url = process.env.DATABASE_URL ?? "file:../data/fandogh.db";
  const relative = url.replace(/^file:/, "");
  const file = path.resolve(process.cwd(), "prisma", relative);

  try {
    const buffer = await readFile(file);
    await logAdmin("backup_downloaded", path.basename(file), `${Math.round(buffer.length / 1024)} کیلوبایت`);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="fandogh-backup-${new Date().toISOString().slice(0, 10)}.db"`,
      },
    });
  } catch {
    return new NextResponse("database file not found", { status: 404 });
  }
}
