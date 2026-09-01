/** نمایش پیام موقت که از طریق پارامتر آدرس منتقل می‌شود */
export default function Flash({ msg, type }: { msg?: string; type?: string }) {
  if (!msg) return null;
  return <div className={`alert ${type === "error" ? "alert-error" : "alert-success"}`}>{msg}</div>;
}
