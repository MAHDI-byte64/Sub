import "server-only";
import { asBool, asNum, getSettings, saveSettings } from "./settings";

/**
 * نرخ تبدیل تومان به تتر.
 *
 * اول نرخ خودکار (از یک منبع قابل تنظیم، پیش‌فرض نوبیتکس) خوانده و در تنظیمات
 * کش می‌شود؛ اگر منبع در دسترس نبود یا خودکار خاموش باشد، نرخ دستی مدیر ملاک
 * است. یک «حاشیهٔ امن» درصدی هم روی نرخ اعمال می‌شود تا نوسان چند دقیقه‌ای
 * فروشنده را ضرر ندهد.
 */

export type Rate = {
  /** تومان به ازای هر تتر (بعد از اعمال حاشیه) */
  toman: number;
  source: "auto" | "manual";
  fetchedAt: Date | null;
  /** نرخ خام قبل از حاشیه */
  raw: number;
  margin: number;
};

const CACHE_MS = 10 * 60_000;

function readPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object") {
      const rec = acc as Record<string, unknown>;
      if (key in rec) return rec[key];
    }
    return undefined;
  }, source);
}

/** خواندن نرخ از منبع خارجی؛ خطا یعنی «نشد»، نه توقف کار */
async function fetchRate(url: string, path: string): Promise<number | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as unknown;
    const value = Number(readPath(json, path));
    if (!Number.isFinite(value) || value <= 0) return null;

    // بعضی منبع‌ها ریال می‌دهند؛ عددهای خیلی بزرگ را به تومان تبدیل می‌کنیم
    return value > 5_000_000 ? Math.round(value / 10) : Math.round(value);
  } catch {
    return null;
  }
}

/** نرخ فعلی (با کش ۱۰ دقیقه‌ای در تنظیمات) */
export async function usdtRate(force = false): Promise<Rate> {
  const settings = await getSettings();
  const manual = Math.max(0, asNum(settings.usdt_rate_manual, 0));
  const margin = Math.max(0, asNum(settings.usdt_rate_margin, 2));
  const withMargin = (value: number) => Math.round((value * (100 + margin)) / 100);

  if (!asBool(settings.usdt_rate_auto)) {
    return { toman: withMargin(manual), source: "manual", fetchedAt: null, raw: manual, margin };
  }

  const cached = asNum(settings.usdt_rate_cached, 0);
  const cachedAt = Number(settings.usdt_rate_cached_at || 0);
  if (!force && cached > 0 && Date.now() - cachedAt < CACHE_MS) {
    return {
      toman: withMargin(cached),
      source: "auto",
      fetchedAt: new Date(cachedAt),
      raw: cached,
      margin,
    };
  }

  const fresh = await fetchRate(
    settings.usdt_rate_url || "https://api.nobitex.ir/v2/orderbook/USDTIRT",
    settings.usdt_rate_path || "lastTradePrice",
  );

  if (fresh) {
    await saveSettings({
      usdt_rate_cached: String(fresh),
      usdt_rate_cached_at: String(Date.now()),
    });
    return { toman: withMargin(fresh), source: "auto", fetchedAt: new Date(), raw: fresh, margin };
  }

  // منبع در دسترس نبود: نرخ کش‌شده، وگرنه نرخ دستی
  if (cached > 0) {
    return {
      toman: withMargin(cached),
      source: "auto",
      fetchedAt: cachedAt ? new Date(cachedAt) : null,
      raw: cached,
      margin,
    };
  }
  return { toman: withMargin(manual), source: "manual", fetchedAt: null, raw: manual, margin };
}

/** تومان → تتر (رو به بالا تا دو رقم اعشار، تا کمتر از مبلغ لازم دریافت نشود) */
export function tomanToUsdt(amountToman: number, rateToman: number): number {
  if (rateToman <= 0) return 0;
  return Math.ceil((amountToman / rateToman) * 100) / 100;
}
