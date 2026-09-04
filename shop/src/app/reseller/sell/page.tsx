import Link from "next/link";
import { db } from "@/lib/db";
import { requireReseller } from "@/lib/auth";
import { resellerOptions, resellerPlans, resellerProfile } from "@/lib/reseller";
import { deviceLabel, faNum, planDaysLabel, planVolumeLabel, toman } from "@/lib/format";
import SellForm from "@/components/SellForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "فروش سرویس" };

export default async function ResellerSellPage() {
  const user = await requireReseller();
  const [profile, allPlans, panels, options] = await Promise.all([
    resellerProfile(user.id),
    resellerPlans(user.resellerOff),
    db.panel.findMany({ where: { isActive: true, autoDisabled: false }, orderBy: { sortOrder: "asc" } }),
    resellerOptions(),
  ]);

  // اگر مدیر نمایش پلن‌ها به نماینده را بسته باشد، فقط فروش دلخواه می‌ماند
  const plans = options.showPlans ? allPlans : [];
  const canSell = (plans.length > 0 || options.showCustom) && panels.length > 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>فروش سرویس</h1>
          <p>
            {options.showCustom
              ? "پلن آماده را انتخاب کنید یا حجم و زمان را خودتان بچینید؛ مبلغ عمده از اعتبار شما کم و سرویس در همان لحظه ساخته می‌شود."
              : "پلن را انتخاب کنید؛ مبلغ عمده از اعتبار شما کم و سرویس در همان لحظه ساخته می‌شود."}
          </p>
        </div>
        <span className="badge badge-info">اعتبار: {toman(profile.balance)}</span>
      </div>

      {canSell ? (
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <div className="card">
            <div className="card-title">
              <h3>🛒 سفارش تازه</h3>
              <span className="badge badge-success">{faNum(profile.discount)}٪ تخفیف</span>
            </div>
            <SellForm
              balance={profile.balance}
              rates={options.showCustom ? options.rates : null}
              discount={profile.discount}
              showPlans={options.showPlans}
              plans={plans.map((plan) => ({
                id: plan.id,
                title: plan.title,
                price: plan.price,
                listPrice: plan.listPrice,
                summary: `${planVolumeLabel(plan.volumeGb)} · ${planDaysLabel(plan.days)} · ${deviceLabel(plan.deviceLimit)}`,
                panelIds: plan.panels.map((p) => p.id),
              }))}
              panels={panels.map((p) => ({ id: p.id, flag: p.flag, location: p.location }))}
            />
          </div>

          <div className="card">
            <div className="card-title">
              <h3>راهنما</h3>
            </div>
            <div className="svc-meta">
              <div className="meta-row">
                <span>💰 پرداخت</span>
                <b>از اعتبار نمایندگی، بدون رسید</b>
              </div>
              <div className="meta-row">
                <span>⚡ تحویل</span>
                <b>همان لحظه، کانفیگ آماده</b>
              </div>
              <div className="meta-row">
                <span>🏷️ نام مشتری</span>
                <b>فقط برای خودتان؛ مشتری آن را نمی‌بیند</b>
              </div>
              <div className="meta-row">
                <span>🔄 تمدید</span>
                <b>از صفحهٔ همان سرویس، با همان قیمت عمده</b>
              </div>
              {options.showCustom ? (
                <div className="meta-row">
                  <span>🎚️ نرخ دلخواه</span>
                  <b>
                    گیگ {toman(options.rates.perGb, false)} · روز {toman(options.rates.perDay, false)}
                  </b>
                </div>
              ) : null}
            </div>
            <p className="field-hint" style={{ marginTop: 12 }}>
              اگر اعتبارتان کم است، از <Link href="/reseller/wallet">صفحهٔ اعتبار</Link> شارژ کنید.
              لینک اشتراک و QR هر سرویس بعد از ساخت، در صفحهٔ همان مشتری در دسترس است.
            </p>
          </div>
        </div>
      ) : (
        <div className="card empty">
          <div className="empty-icon">🗂️</div>
          <p>
            {panels.length
              ? "راه فروشی برای شما فعال نیست: نه پلن آماده‌ای هست و نه فروش با حجم دلخواه."
              : "سرور فعالی برای تحویل وجود ندارد."}
          </p>
          <p className="dim">با پشتیبانی تماس بگیرید.</p>
        </div>
      )}
    </div>
  );
}
