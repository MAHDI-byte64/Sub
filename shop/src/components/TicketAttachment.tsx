import { isImageFile } from "@/lib/uploads";

/**
 * پیوست یک پیام تیکت.
 *
 * تصویرها پیش‌نمایش کوچک می‌گیرند و بقیه (PDF) فقط لینک دانلود؛ فایل از مسیر
 * محافظت‌شدهٔ /api/attachment سرو می‌شود، نه از پوشهٔ عمومی.
 */
export default function TicketAttachment({
  file,
  name,
  label,
  openLabel,
}: {
  file: string;
  name?: string | null;
  /** برچسب پیش‌فرض وقتی نام اصلی فایل ذخیره نشده باشد */
  label: string;
  openLabel: string;
}) {
  const href = `/api/attachment/${file}`;
  const title = name || label;

  if (isImageFile(file)) {
    return (
      <a className="attach-thumb" href={href} target="_blank" rel="noreferrer" title={title}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={href} alt={title} loading="lazy" />
        <span>{openLabel}</span>
      </a>
    );
  }

  return (
    <a className="attach-chip" href={href} target="_blank" rel="noreferrer">
      📎 {title}
    </a>
  );
}
