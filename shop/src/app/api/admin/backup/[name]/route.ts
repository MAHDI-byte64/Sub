import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { logAdmin } from "@/lib/adminlog";
import { readBackup, safeBackupName } from "@/lib/backup";

/** دانلود یک فایل پشتیبان از فهرست پشتیبان‌ها (فقط مدیر) */
export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return new NextResponse("forbidden", { status: 403 });

  const { name } = await ctx.params;
  const safe = safeBackupName(name);
  if (!safe) return new NextResponse("bad name", { status: 400 });

  const buffer = await readBackup(safe);
  if (!buffer) return new NextResponse("not found", { status: 404 });

  await logAdmin("backup_downloaded", safe, `${Math.round(buffer.length / 1024)} کیلوبایت`);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${safe}"`,
      "Cache-Control": "no-store",
    },
  });
}
