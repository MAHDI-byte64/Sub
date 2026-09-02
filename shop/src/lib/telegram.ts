import "server-only";
import { asBool, getSettings } from "./settings";

/** فراخوانی مستقیم API تلگرام */
export async function telegramApi<T = unknown>(
  method: string,
  payload: Record<string, unknown>,
  token?: string,
): Promise<{ ok: boolean; result?: T; description?: string }> {
  const botToken = token ?? (await getSettings()).telegram_bot_token?.trim();
  if (!botToken) return { ok: false, description: "توکن ربات تنظیم نشده است." };

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    });
    return (await res.json()) as { ok: boolean; result?: T; description?: string };
  } catch (err) {
    return { ok: false, description: (err as Error).message };
  }
}

/** ارسال پیام به یک چت مشخص */
export async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const res = await telegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
  return Boolean(res.ok);
}

/** ارسال پیام به ادمین در تلگرام (بی‌صدا خطا را نادیده می‌گیرد) */
export async function notifyAdmin(text: string, kind: "order" | "ticket" | "system" = "system"): Promise<void> {
  try {
    const settings = await getSettings();
    const token = settings.telegram_bot_token?.trim();
    const chatId = settings.telegram_admin_chat_id?.trim();
    if (!token || !chatId) return;
    if (kind === "order" && !asBool(settings.notify_on_new_order)) return;
    if (kind === "ticket" && !asBool(settings.notify_on_ticket)) return;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // اطلاع‌رسانی نباید جریان اصلی را متوقف کند
  }
}
