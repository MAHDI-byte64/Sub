import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { faNum } from "@/lib/format";

export const metadata = { title: "قوانین و مقررات" };

const RULES = [
  "سرویس صرفاً برای عبور امن از فیلترینگ و حفظ حریم خصوصی ارائه می‌شود.",
  "هرگونه استفاده غیرقانونی، ارسال هرزنامه، حملات شبکه‌ای یا سوءاستفاده باعث قطع فوری سرویس بدون بازگشت وجه می‌شود.",
  "تعداد کاربر همزمان هر پلن مشخص است؛ فروش مجدد یا اشتراک‌گذاری عمومی لینک مجاز نیست.",
  "حجم و مدت اعتبار هر سرویس از لحظهٔ تحویل محاسبه می‌شود.",
  "در صورت اختلال از سمت ما، معادل زمان قطعی به سرویس شما اضافه می‌شود.",
  "پرداخت‌ها کارت‌به‌کارت است و پس از تحویل سرویس، بازگشت وجه فقط در صورت اختلال فنی از سمت ما انجام می‌شود.",
  "ما لاگ فعالیت کاربران را ذخیره نمی‌کنیم؛ تنها حجم مصرفی برای مدیریت سرویس ثبت می‌شود.",
];

export default async function TermsPage() {
  const s = await getSettings();

  return (
    <div className="container section" style={{ maxWidth: 880 }}>
      <div className="section-head">
        <h1>قوانین و مقررات</h1>
        <p>استفاده از سرویس {s.site_name} به معنی پذیرش این شرایط است.</p>
      </div>

      <div className="rule-list">
        {RULES.map((rule, i) => (
          <div className="rule-item" key={rule}>
            <i>{faNum(i + 1)}</i>
            <p>{rule}</p>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-title">
          <h3>سوالی دربارهٔ قوانین دارید؟</h3>
        </div>
        <p>
          از طریق {s.support_telegram} یا {s.support_email} با ما در تماس باشید، یا از پنل کاربری تیکت
          بزنید.
        </p>
        <div className="btn-row">
          <Link className="btn btn-sm btn-primary" href="/contact">
            تماس با ما
          </Link>
          <Link className="btn btn-sm" href="/faq">
            سوالات متداول
          </Link>
        </div>
      </div>
    </div>
  );
}
