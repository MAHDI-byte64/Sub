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
