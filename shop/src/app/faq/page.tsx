import { FAQ } from "@/lib/content";

export const metadata = { title: "سوالات متداول" };

export default function FaqPage() {
  return (
    <div className="container section">
      <div className="section-head">
        <h1>سوالات متداول</h1>
        <p>اگر پاسخ سوالتان اینجا نبود، از بخش تیکت‌ها بپرسید.</p>
      </div>
      <div style={{ maxWidth: 760, marginInline: "auto" }}>
        {FAQ.map((item) => (
          <details className="accordion" key={item.q}>
            <summary>{item.q}</summary>
            <div className="acc-body">{item.a}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
