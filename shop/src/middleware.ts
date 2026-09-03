import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/auth";

/**
 * حالت تعمیر و نگهداری.
 *
 * روی Node.js اجرا می‌شود (نه Edge) تا بتواند مستقیم از دیتابیس بخواند؛ نتیجه
 * چند ثانیه در حافظه کش می‌شود تا هر درخواست یک کوئری اضافه نزند.
 */
export const config = {
  runtime: "nodejs",
  matcher: ["/((?!_next/|fonts/|api/|favicon|icon|manifest|sw\\.js|.*\\.[a-zA-Z0-9]+$).*)"],
};

/** مسیرهایی که حتی در حالت تعمیر هم باید باز باشند */
const ALWAYS_OPEN = ["/maintenance", "/login", "/logout", "/admin"];

/** وضعیت تعمیر حداکثر ۲ ثانیه کش می‌شود: هم فشار روی دیتابیس نمی‌آید،
 *  هم روشن/خاموش‌کردن از پنل مدیریت تقریباً بلافاصله اثر می‌کند. */
const CACHE_MS = 2_000;
let cached: { at: number; on: boolean } = { at: 0, on: false };

async function maintenanceOn(): Promise<boolean> {
  if (Date.now() - cached.at < CACHE_MS) return cached.on;
  try {
    const row = await db.setting.findUnique({ where: { key: "maintenance_mode" } });
    cached = { at: Date.now(), on: row?.value === "1" };
  } catch {
    cached = { at: Date.now(), on: false };
  }
  return cached.on;
}

/** آیا صاحب این کوکی مدیر است؟ (نشست معتبر با نقش admin) */
async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    const session = await db.session.findUnique({
      where: { id: token },
      select: { expiresAt: true, user: { select: { role: true } } },
    });
    return Boolean(
      session && session.expiresAt.getTime() > Date.now() && session.user.role === "admin",
    );
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (ALWAYS_OPEN.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!(await maintenanceOn())) return NextResponse.next();
  if (await isAdminRequest(req)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/maintenance";
  url.search = "";
  const res = NextResponse.rewrite(url);
  res.headers.set("Retry-After", "600");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
