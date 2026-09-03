import Link from "next/link";
import { db } from "@/lib/db";
import { requireReseller } from "@/lib/auth";
import { resellerProfile, resellerStats } from "@/lib/reseller";
import { availableMethods } from "@/lib/payments";
import { asNum, getSettings } from "@/lib/settings";
import { walletKind } from "@/lib/wallet";
import { faDate, faNum, relativeTime, toman } from "@/lib/format";
import TopupForm from "@/components/TopupForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "اعتبار نمایندگی" };

export default async function ResellerWalletPage() {
  const user = await requireReseller();
  const [profile, stats, txs, settings] = await Promise.all([
    resellerProfile(user.id),
    resellerStats(user.id),
    db.walletTx.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 40 }),
    getSettings(),
  ]);
  const methods = await availableMethods(asNum(settings.min_topup, 50_000), user);

  const charged = txs.filter((t) => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>اعتبار نمایندگی</h1>
          <p>هر فروش و تمدید، همان لحظه از این اعتبار کم می‌شود.</p>
        </div>
        <span className="badge badge-info">{toman(profile.balance)}</span>
      </div>

      <div className="summary-strip">
        <div className="summary-tile">
          <span>💰 موجودی</span>
          <b>{toman(profile.balance, false)}</b>
        </div>
        <div className="summary-tile">
          <span>⬆️ مجموع شارژ</span>
          <b>{toman(charged, false)}</b>
        </div>
        <div className="summary-tile">
          <span>🛒 مجموع خرید</span>
          <b>{toman(stats.spent, false)}</b>
        </div>
        <div className="summary-tile">
          <span>👥 سرویس فروخته‌شده</span>
          <b>{faNum(stats.services)}</b>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div className="card">
          <div className="card-title">
            <h3>➕ شارژ اعتبار</h3>
          </div>
          <TopupForm
            min={asNum(settings.min_topup, 50_000)}
            methods={{
              card: methods.card,
              crypto: methods.crypto,
              gateways: methods.gateways.map((g) => ({ id: g.id, label: g.label })),
            }}
          />
          <p className="field-hint" style={{ marginTop: 10 }}>
            شارژ از همان کیف پول حساب شماست؛ می‌توانید از <Link href="/dashboard/wallet">پنل کاربری</Link>{" "}
            هم شارژ کنید.
          </p>
        </div>

        <div className="card data-card">
          <div className="data-head">
            <h3>تراکنش‌ها</h3>
            <Link className="btn btn-sm" href="/reseller/services">
              مشتری‌ها
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
                      <td className="nowrap">{walletKind("fa", tx.kind)}</td>
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
    </div>
  );
}
