import Link from "next/link";
import { requireReseller } from "@/lib/auth";
import { customQuote, resellerOptions, resellerPlans, resellerProfile } from "@/lib/reseller";
import { deviceLabel, faNum, planDaysLabel, planVolumeLabel, toman } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "لیست قیمت" };

export default async function ResellerPricesPage() {
  const user = await requireReseller();
  const [allPlans, profile, options] = await Promise.all([
    resellerPlans(user.resellerOff),
    resellerProfile(user.id),
    resellerOptions(),
  ]);

  const plans = options.showPlans ? allPlans : [];
  const totalSaving = plans.reduce((sum, plan) => sum + plan.saving, 0);

  // نمونه‌ای از قیمت دلخواه تا نماینده بدون حساب‌کردن، حس قیمت را بگیرد
  const rates = options.rates;
  const samples = options.showCustom
    ? [
        { gb: Math.max(rates.minGb, 30), days: Math.max(rates.minDays, 30) },
        { gb: Math.max(rates.minGb, 60), days: Math.max(rates.minDays, 30) },
        { gb: Math.max(rates.minGb, 100), days: Math.max(rates.minDays, 60) },
      ].map((sample) => ({ ...sample, ...customQuote(rates, sample.gb, sample.days, profile.discount) }))
    : [];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>لیست قیمت شما</h1>
          <p>
            {options.showPlans
              ? `قیمت عمدهٔ هر پلن با ${faNum(profile.discount)}٪ تخفیف نمایندگی.`
              : `نرخ حجم و زمان دلخواه با ${faNum(profile.discount)}٪ تخفیف نمایندگی.`}
          </p>
        </div>
        <Link className="btn btn-sm btn-primary" href="/reseller/sell">
          فروش سرویس
        </Link>
      </div>

      {options.showCustom ? (
        <div className="card">
          <div className="card-title">
            <h3>🎚️ قیمت حجم و زمان دلخواه</h3>
            <span className="badge badge-success">{faNum(profile.discount)}٪ تخفیف شما</span>
          </div>
          <p className="field-hint" style={{ marginBottom: 12 }}>
            قیمت = (گیگابایت × نرخ هر گیگ) + (روز × نرخ هر روز)، بعد تخفیف نمایندگی شما. با همین
            نرخ‌ها می‌توانید در صفحهٔ «فروش سرویس» هر ترکیبی بسازید.
          </p>
          <div className="summary-strip">
            <div className="summary-tile">
              <span>📦 هر گیگابایت</span>
              <b>{toman(rates.perGb, false)}</b>
            </div>
            <div className="summary-tile">
              <span>📅 هر روز</span>
              <b>{toman(rates.perDay, false)}</b>
            </div>
            <div className="summary-tile">
              <span>🎚️ محدودهٔ حجم</span>
              <b>
                {faNum(rates.minGb)} تا {faNum(rates.maxGb)} گیگ
              </b>
            </div>
            <div className="summary-tile">
              <span>⏳ محدودهٔ مدت</span>
              <b>
                {faNum(rates.minDays)} تا {faNum(rates.maxDays)} روز
              </b>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نمونه</th>
                  <th>قیمت سایت</th>
                  <th>قیمت شما</th>
                  <th>سود شما</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((sample) => (
                  <tr key={`${sample.gb}-${sample.days}`}>
                    <td className="nowrap">
                      {faNum(sample.gb)} گیگ · {faNum(sample.days)} روز
                    </td>
                    <td className="nowrap dim" style={{ textDecoration: "line-through" }}>
                      {toman(sample.listPrice)}
                    </td>
                    <td className="nowrap">
                      <b className="gold">{toman(sample.price)}</b>
                    </td>
                    <td className="nowrap">{toman(sample.saving)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {plans.length ? (
        <>
          <div className="summary-strip">
            <div className="summary-tile">
              <span>🏷️ تعداد پلن</span>
              <b>{faNum(plans.length)}</b>
            </div>
            <div className="summary-tile">
              <span>٪ تخفیف شما</span>
              <b>{faNum(profile.discount)}٪</b>
            </div>
            <div className="summary-tile">
              <span>💰 سود روی یک دور فروش</span>
              <b>{toman(totalSaving, false)}</b>
            </div>
            <div className="summary-tile">
              <span>💳 اعتبار فعلی</span>
              <b>{toman(profile.balance, false)}</b>
            </div>
          </div>

          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>پلن</th>
                    <th>مشخصات</th>
                    <th>قیمت سایت</th>
                    <th>قیمت شما</th>
                    <th>سود شما</th>
                    <th>لوکیشن‌ها</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id}>
                      <td>
                        <span className="cell-main">{plan.title}</span>
                        {plan.subtitle ? <span className="cell-sub">{plan.subtitle}</span> : null}
                      </td>
                      <td className="nowrap">
                        <span className="cell-main">{planVolumeLabel(plan.volumeGb)}</span>
                        <span className="cell-sub">
                          {planDaysLabel(plan.days)} · {deviceLabel(plan.deviceLimit)}
                        </span>
                      </td>
                      <td className="nowrap dim" style={{ textDecoration: "line-through" }}>
                        {toman(plan.listPrice)}
                      </td>
                      <td className="nowrap">
                        <b className="gold">{toman(plan.price)}</b>
                      </td>
                      <td className="nowrap">{toman(plan.saving)}</td>
                      <td className="nowrap">
                        {plan.panels.length
                          ? plan.panels.map((p) => `${p.flag} ${p.location}`).join("، ")
                          : "همه لوکیشن‌ها"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="field-hint" style={{ marginTop: 12 }}>
              قیمت فروش به مشتری با خودتان است؛ این‌ها قیمتی است که از اعتبار شما کم می‌شود.
            </p>
          </div>
        </>
      ) : options.showCustom ? null : (
        <div className="card empty">
          <div className="empty-icon">🏷️</div>
          <p>هنوز پلنی برای فروش تعریف نشده است.</p>
        </div>
      )}
    </div>
  );
}
