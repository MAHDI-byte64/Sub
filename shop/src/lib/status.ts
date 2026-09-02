import type { Locale } from "./i18n";

export const ORDER_STATUS: Record<string, { label: string; badge: string; hint: string }> = {
  awaiting_receipt: {
    label: "در انتظار پرداخت",
    badge: "badge-warn",
    hint: "مبلغ را کارت‌به‌کارت کنید و تصویر رسید را بارگذاری کنید.",
  },
  awaiting_payment: {
    label: "در انتظار پرداخت آنلاین",
    badge: "badge-warn",
    hint: "برای تکمیل خرید، پرداخت را از طریق درگاه انجام دهید.",
  },
  pending_review: {
    label: "در حال بررسی",
    badge: "badge-info",
    hint: "رسید شما ثبت شد و در صف بررسی پشتیبانی است.",
  },
  approved: {
    label: "تأیید شده",
    badge: "badge-success",
    hint: "سفارش تأیید و سرویس شما تحویل داده شد.",
  },
  rejected: {
    label: "رد شده",
    badge: "badge-danger",
    hint: "رسید تأیید نشد. می‌توانید رسید درست را دوباره بارگذاری کنید.",
  },
  canceled: { label: "لغو شده", badge: "badge-danger", hint: "این سفارش لغو شده است." },
  failed: { label: "خطا در تحویل", badge: "badge-danger", hint: "در تحویل سرویس خطایی رخ داد؛ با پشتیبانی تماس بگیرید." },
};

export const TICKET_STATUS: Record<string, { label: string; badge: string }> = {
  open: { label: "باز", badge: "badge-warn" },
  answered: { label: "پاسخ داده شده", badge: "badge-success" },
  closed: { label: "بسته", badge: "badge" },
};

/* -------------------------------------------------------------------------- */
/*                          نسخهٔ انگلیسی همین برچسب‌ها                          */
/* -------------------------------------------------------------------------- */

const ORDER_STATUS_EN: Record<string, { label: string; badge: string; hint: string }> = {
  awaiting_receipt: {
    label: "Awaiting payment",
    badge: "badge-warn",
    hint: "Transfer the amount and upload a picture of the receipt.",
  },
  awaiting_payment: {
    label: "Awaiting online payment",
    badge: "badge-warn",
    hint: "Complete the payment through the gateway to finish your order.",
  },
  pending_review: {
    label: "Under review",
    badge: "badge-info",
    hint: "Your receipt was submitted and is queued for review.",
  },
  approved: {
    label: "Approved",
    badge: "badge-success",
    hint: "The order was approved and your service is delivered.",
  },
  rejected: {
    label: "Rejected",
    badge: "badge-danger",
    hint: "The receipt was not accepted. You can upload the correct one again.",
  },
  canceled: { label: "Canceled", badge: "badge-danger", hint: "This order was canceled." },
  failed: {
    label: "Delivery failed",
    badge: "badge-danger",
    hint: "Something went wrong while delivering the service; please contact support.",
  },
};

const TICKET_STATUS_EN: Record<string, { label: string; badge: string }> = {
  open: { label: "Open", badge: "badge-warn" },
  answered: { label: "Answered", badge: "badge-success" },
  closed: { label: "Closed", badge: "badge" },
};

/** وضعیت سفارش به زبان جاری */
export function orderStatus(locale: Locale, key: string) {
  const map = locale === "en" ? ORDER_STATUS_EN : ORDER_STATUS;
  return map[key] ?? map.awaiting_receipt;
}

/** وضعیت تیکت به زبان جاری */
export function ticketStatus(locale: Locale, key: string) {
  const map = locale === "en" ? TICKET_STATUS_EN : TICKET_STATUS;
  return map[key] ?? map.open;
}
