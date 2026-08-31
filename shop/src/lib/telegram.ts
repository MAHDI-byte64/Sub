import "server-only";
import { asBool, getSettings } from "./settings";

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
