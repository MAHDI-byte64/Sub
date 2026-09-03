import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logAdmin } from "@/lib/adminlog";
import { databasePath } from "@/lib/backup";

/** دانلود فایل دیتابیس برای پشتیبان‌گیری (فقط مدیر) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new NextResponse("forbidden", { status: 403 });

  const file = databasePath();

  try {
    const buffer = await readFile(/*turbopackIgnore: true*/ file);
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
