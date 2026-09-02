import type { TicketMessage } from "@prisma/client";

/**
 * میانگین زمان پاسخ پشتیبانی: فاصلهٔ هر پیام کاربر تا اولین پاسخ پشتیبانی بعد از آن.
 * اگر هنوز پاسخی داده نشده باشد، آن پیام در میانگین حساب نمی‌شود.
 */
export function averageResponseMs(messages: Pick<TicketMessage, "fromAdmin" | "createdAt">[]): number | null {
  const sorted = [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const gaps: number[] = [];
  let pendingUserAt: number | null = null;

  for (const msg of sorted) {
    if (!msg.fromAdmin) {
      if (pendingUserAt === null) pendingUserAt = msg.createdAt.getTime();
    } else if (pendingUserAt !== null) {
      gaps.push(msg.createdAt.getTime() - pendingUserAt);
      pendingUserAt = null;
    }
  }

  if (!gaps.length) return null;
  return Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
}

/** آیا آخرین پیام از سمت کاربر است (یعنی منتظر پاسخ پشتیبانی) */
export function awaitingReply(messages: Pick<TicketMessage, "fromAdmin">[]): boolean {
  const last = messages[messages.length - 1];
  return Boolean(last && !last.fromAdmin);
}

/** گروه‌بندی پیام‌ها بر اساس روز برای نمایش جداکنندهٔ تاریخ */
export function groupByDay<T extends { createdAt: Date }>(messages: T[]): { day: Date; items: T[] }[] {
  const groups: { day: Date; items: T[] }[] = [];
  for (const msg of messages) {
    const day = new Date(msg.createdAt);
    day.setHours(0, 0, 0, 0);
    const last = groups[groups.length - 1];
    if (last && last.day.getTime() === day.getTime()) last.items.push(msg);
    else groups.push({ day, items: [msg] });
  }
  return groups;
}
