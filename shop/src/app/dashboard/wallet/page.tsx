import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { asBool, asNum, getSettings } from "@/lib/settings";
import { fmt } from "@/lib/format";
import { walletKind } from "@/lib/wallet";
import { getLocale } from "@/lib/locale";
import { translator } from "@/lib/i18n";
import { gatewayMin, gatewayReady } from "@/lib/gateway";
import TopupForm from "@/components/TopupForm";
import CopyButton from "@/components/CopyButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "کیف پول" };

export default async function WalletPage() {
  const user = await requireUser("/dashboard/wallet");
  const locale = await getLocale();
  const tr = translator(locale);
  const f = fmt(locale);
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
          <h1>{tr("dashPages.walletTitle")}</h1>
          <p>{tr("dashPages.walletSubtitle")}</p>
        </div>
        <span className="badge badge-info">{f.money(row.balance)}</span>
      </div>

      {!enabled ? (
        <div className="alert alert-warn">{tr("dashPages.walletTitle")}</div>
      ) : null}

      <div className="summary-strip">
        <div className="summary-tile">
          <span>{tr("dashPages.walletBalanceTile")}</span>
          <b>{f.money(row.balance, false)}</b>
        </div>
        <div className="summary-tile">
          <span>{tr("dashPages.totalTopup")}</span>
          <b>{f.money(charged, false)}</b>
        </div>
        <div className="summary-tile">
          <span>{tr("dashPages.totalSpent")}</span>
          <b>{f.money(spent, false)}</b>
        </div>
        <div className="summary-tile">
          <span>{tr("dashPages.referralBonus")}</span>
          <b>{f.money(referralEarned._sum.amount ?? 0, false)}</b>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        {enabled ? (
          <div className="card">
            <div className="card-title">
              <h3>➕ {tr("dashPages.topup")}</h3>
            </div>
            <TopupForm
              locale={locale}
              min={asNum(settings.min_topup, 50_000)}
              online={{ enabled: gatewayReady(settings), min: gatewayMin(settings) }}
            />
          </div>
        ) : null}

        {percent > 0 && referralLink ? (
          <div className="card">
            <div className="card-title">
              <h3>{tr("dashPages.inviteTitle")}</h3>
              <span className="badge badge-success">
                {tr("dashPages.inviteReward", { percent: f.num(percent) })}
              </span>
            </div>
            <p className="field-hint">
              {tr("dashPages.inviteText", { percent: f.num(percent) })}
            </p>
            <div className="copy-box">
              <code>{referralLink}</code>
              <CopyButton value={referralLink} />
            </div>
            <div className="svc-meta" style={{ marginTop: 14 }}>
              <div className="meta-row">
                <span>{tr("dashPages.invited")}</span>
                <b>
                  {f.num(referrals)} {tr("dashPages.people")}
                </b>
              </div>
              <div className="meta-row">
                <span>{tr("dashPages.totalReward")}</span>
                <b className="gold">{f.money(referralEarned._sum.amount ?? 0)}</b>
              </div>
              <div className="meta-row">
                <span>{tr("dashPages.yourCode")}</span>
                <b className="mono">{row.referralCode}</b>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="card data-card">
        <div className="data-head">
          <h3>{tr("dashPages.transactions")}</h3>
          <Link className="btn btn-sm" href="/dashboard/orders">
            {tr("dash.orders")}
          </Link>
        </div>
        {txs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tr("dashPages.txType")}</th>
                  <th>{tr("dashPages.txAmount")}</th>
                  <th>{tr("dashPages.txNote")}</th>
                  <th>{tr("dashPages.txDate")}</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((tx) => (
                  <tr key={tx.id}>
                    <td className="nowrap">{walletKind(locale, tx.kind)}</td>
                    <td className="nowrap">
                      <b style={{ color: tx.amount > 0 ? "var(--green)" : "var(--red)" }}>
                        {tx.amount > 0 ? "+" : "−"} {f.money(Math.abs(tx.amount))}
                      </b>
                    </td>
                    <td className="cell-sub">{tx.note ?? "—"}</td>
                    <td className="nowrap">
                      <span className="cell-main">{f.relative(tx.createdAt)}</span>
                      <span className="cell-sub">{f.date(tx.createdAt, true)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty" style={{ padding: 26 }}>
            <div className="empty-icon">💰</div>
            {tr("dashPages.noTx")}
          </div>
        )}
      </div>
    </div>
  );
}
