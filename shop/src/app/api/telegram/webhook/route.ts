import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { sendTelegram } from "@/lib/telegram";
import { notifyUser } from "@/lib/notify";
import { faNum, toman } from "@/lib/format";

/**
 * وب‌هوک ربات تلگرام: مدیر می‌تواند مستقیم از تلگرام به تیکت‌ها پاسخ دهد.
 *
 *   /reply <شناسه تیکت> <متن>     پاسخ به تیکت
 *   ریپلای روی اعلان تیکت         پاسخ به همان تیکت (شناسه از #T… خوانده می‌شود)
 *   /stats                        خلاصه وضعیت فروشگاه
 *   /help                         راهنما
 */

type TelegramMessage = {
  message_id?: number;
  text?: string;
  chat?: { id?: number | string };
  reply_to_message?: { text?: string };
};

const HELP = [
  "🤖 <b>ربات پشتیبانی</b>",
  "",
  "• برای پاسخ به یک تیکت، اعلان آن را <b>ریپلای</b> کنید و متن پاسخ را بنویسید.",
  "• یا بنویسید: <code>/reply شناسه‌تیکت متن پاسخ</code>",
  "• <code>/stats</code> — خلاصه فروش و وضعیت",
  "• <code>/help</code> — همین راهنما",
].join("\n");

function extractTicketId(text: string | undefined): string | null {
  if (!text) return null;
  const tag = text.match(/#T([A-Za-z0-9_-]{10,})/);
  return tag ? tag[1] : null;
}

export async function POST(request: Request) {
  const settings = await getSettings();
  const secret = settings.telegram_webhook_secret?.trim();
  const adminChat = settings.telegram_admin_chat_id?.trim();

  // فقط تلگرامِ خودمان اجازه دارد
  if (!secret || request.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await request.json().catch(() => ({}))) as { message?: TelegramMessage };
  const message = update.message;
  const chatId = String(message?.chat?.id ?? "");
  const text = (message?.text ?? "").trim();

  // فقط مدیر می‌تواند دستور بدهد
  if (!chatId || !adminChat || chatId !== adminChat) {
    return NextResponse.json({ ok: true });
  }
  if (!text) return NextResponse.json({ ok: true });

  if (text.startsWith("/help") || text.startsWith("/start")) {
    await sendTelegram(chatId, HELP);
    return NextResponse.json({ ok: true });
  }

  if (text.startsWith("/stats")) {
    const [pending, openTickets, activeServices, revenue] = await Promise.all([
      db.order.count({ where: { status: "pending_review" } }),
      db.ticket.count({ where: { status: "open" } }),
      db.service.count({ where: { status: "active" } }),
      db.order.aggregate({ where: { status: "approved" }, _sum: { payable: true } }),
    ]);
    await sendTelegram(
      chatId,
      [
        `📊 <b>${settings.site_name}</b>`,
        `سفارش در انتظار بررسی: ${faNum(pending)}`,
        `تیکت باز: ${faNum(openTickets)}`,
        `سرویس فعال: ${faNum(activeServices)}`,
        `درآمد کل: ${toman(revenue._sum.payable ?? 0)}`,
      ].join("\n"),
    );
    return NextResponse.json({ ok: true });
  }

  // پاسخ به تیکت: /reply <id> <متن>  یا  ریپلای روی اعلان
  let ticketId: string | null = null;
  let body = "";

  if (text.startsWith("/reply")) {
    const rest = text.slice("/reply".length).trim();
    const [id, ...words] = rest.split(/\s+/);
    ticketId = id || null;
    body = words.join(" ").trim();
  } else {
    ticketId = extractTicketId(message?.reply_to_message?.text);
    body = text;
  }

  if (!ticketId) {
    await sendTelegram(chatId, "برای پاسخ، اعلان تیکت را ریپلای کنید یا از <code>/reply</code> استفاده کنید.\n\n" + HELP);
    return NextResponse.json({ ok: true });
  }
  if (!body) {
    await sendTelegram(chatId, "متن پاسخ خالی است.");
    return NextResponse.json({ ok: true });
  }

  const ticket = await db.ticket.findUnique({ where: { id: ticketId }, include: { user: true } });
  if (!ticket) {
    await sendTelegram(chatId, `تیکتی با شناسهٔ <code>${ticketId}</code> پیدا نشد.`);
    return NextResponse.json({ ok: true });
  }

  await db.ticketMessage.create({ data: { ticketId: ticket.id, body, fromAdmin: true } });
  await db.ticket.update({
    where: { id: ticket.id },
    data: { status: "answered", updatedAt: new Date() },
  });
  await notifyUser({
    userId: ticket.userId,
    kind: "ticket_reply",
    title: "پشتیبانی به تیکت شما پاسخ داد",
    body: `${ticket.subject}: ${body.slice(0, 120)}`,
    href: `/dashboard/tickets/${ticket.id}`,
  });
  await db.adminLog.create({
    data: {
      adminEmail: "telegram",
      action: "ticket_replied",
      target: ticket.user.email,
      detail: body.slice(0, 200),
    },
  });

  await sendTelegram(chatId, `✅ پاسخ برای «${ticket.subject}» ثبت شد و به ${ticket.user.email} اطلاع داده شد.`);
  return NextResponse.json({ ok: true });
}
