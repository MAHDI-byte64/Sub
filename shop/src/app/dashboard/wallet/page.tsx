import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { asBool, asNum, getSettings } from "@/lib/settings";
import { faDate, faNum, relativeTime, toman } from "@/lib/format";
import { WALLET_KIND } from "@/lib/wallet";
import TopupForm from "@/components/TopupForm";
import CopyButton from "@/components/CopyButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "کیف پول" };

export default async function WalletPage() {
  const user = await requireUser("/dashboard/wallet");
  const [row, txs, settings, referrals, referralEarned] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id } }),
    db.walletTx.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 30 }),
    getSettings(),
    db.user.count({ where: { referredById: user.id } }),
    db.walletTx.aggregate({ where: { userId: user.id, kind: "referral" }, _sum: { amount: true } }),
  ]);

  const enabled = asBool(settings.wallet_enabled);
  const percent = asNum(settings.referral_percent, 0);
  const appUrl = (process.env.APP_URL || "").replace(/\/+$/, "");
  const referralLink = row.referralCode
    ? `${appUrl || ""}/register?ref=${row.referralCode}`
    : null;

  const spent = txs.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const charged = txs.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>کیف پول</h1>
          <p>با شارژ حساب، خریدها بدون انتظار برای تأیید رسید و در همان لحظه انجام می‌شوند.</p>
        </div>
        <span className="badge badge-info">{toman(row.balance)}</span>
      </div>

      {!enabled ? (
        <div className="alert alert-warn">کیف پول در حال حاضر غیرفعال است.</div>
      ) : null}

      <div className="summary-strip">
        <div className="summary-tile">
          <span>💰 موجودی</span>
          <b>{toman(row.balance, false)}</b>
        </div>
        <div className="summary-tile">
          <span>⬆️ مجموع شارژ</span>
          <b>{toman(charged, false)}</b>
        </div>
        <div className="summary-tile">
          <span>⬇️ مجموع خرید</span>
          <b>{toman(spent, false)}</b>
        </div>
        <div className="summary-tile">
          <span>🎁 پاداش دعوت</span>
          <b>{toman(referralEarned._sum.amount ?? 0, false)}</b>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        {enabled ? (
          <div className="card">
            <div className="card-title">
              <h3>➕ شارژ کیف پول</h3>
            </div>
            <TopupForm min={asNum(settings.min_topup, 50_000)} />
          </div>
        ) : null}

        {percent > 0 && referralLink ? (
          <div className="card">
            <div className="card-title">
              <h3>🎁 دعوت دوستان</h3>
              <span className="badge badge-success">{faNum(percent)}٪ پاداش</span>
            </div>
            <p className="field-hint">
              این لینک را برای دوستانتان بفرستید؛ با اولین خرید هرکدام، {faNum(percent)}٪ مبلغ خریدشان به
              کیف پول شما اضافه می‌شود.
            </p>
            <div className="copy-box">
              <code>{referralLink}</code>
              <CopyButton value={referralLink} />
            </div>
            <div className="svc-meta" style={{ marginTop: 14 }}>
              <div className="meta-row">
                <span>👥 دعوت‌شده‌ها</span>
                <b>{faNum(referrals)} نفر</b>
              </div>
              <div className="meta-row">
                <span>💵 مجموع پاداش</span>
                <b className="gold">{toman(referralEarned._sum.amount ?? 0)}</b>
              </div>
              <div className="meta-row">
                <span>🔑 کد شما</span>
                <b className="mono">{row.referralCode}</b>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="card data-card">
        <div className="data-head">
          <h3>تراکنش‌ها</h3>
          <Link className="btn btn-sm" href="/dashboard/orders">
            سفارش‌ها
          </Link>
        </div>
        {txs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نوع</th>
                  <th>مبلغ</th>
                  <th>توضیح</th>
                  <th>زمان</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx) => (
                  <tr key={tx.id}>
                    <td className="nowrap">{WALLET_KIND[tx.kind] ?? tx.kind}</td>
                    <td className="nowrap">
                      <b style={{ color: tx.amount > 0 ? "var(--green)" : "var(--red)" }}>
                        {tx.amount > 0 ? "+" : "−"} {toman(Math.abs(tx.amount))}
                      </b>
                    </td>
                    <td className="cell-sub">{tx.note ?? "—"}</td>
                    <td className="nowrap">
                      <span className="cell-main">{relativeTime(tx.createdAt)}</span>
                      <span className="cell-sub">{faDate(tx.createdAt, true)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ padding: 26 }}>
            <div className="empty-icon">💰</div>
            هنوز تراکنشی ندارید.
          </div>
        )}
      </div>
    </div>
  );
}
