import Link from "next/link";
import { db } from "@/lib/db";
import {
  deleteGatewayAction,
  deleteWalletAction,
  importLegacyGatewayAction,
  refreshRateAction,
  saveGatewayAction,
  saveSettingsAction,
  saveWalletAction,
  toggleGatewayAction,
} from "@/app/actions/admin";
import { DRIVERS } from "@/lib/gateway";
import { gatewayUsable } from "@/lib/payments";
import { usdtRate } from "@/lib/rates";
import { asBool, asNum, getSettings, SETTING_DEFS } from "@/lib/settings";
import { faDate, faNum, toman } from "@/lib/format";
import ActionForm from "@/components/ActionForm";
import Flash from "@/components/Flash";

export const dynamic = "force-dynamic";
export const metadata = { title: "روش‌های پرداخت" };

const CRYPTO_KEYS = [
  "crypto_enabled",
  "crypto_min_amount",
  "crypto_note",
  "usdt_rate_auto",
  "usdt_rate_url",
  "usdt_rate_path",
  "usdt_rate_manual",
  "usdt_rate_margin",
];

const CARD_KEYS = ["card_enabled", "card_number", "card_holder", "card_bank", "payment_note"];
const WALLET_KEYS = ["wallet_enabled", "min_topup"];

/** فیلد یک تنظیم، با همان ظاهر صفحهٔ تنظیمات */
function SettingField({ keyName, value }: { keyName: string; value: string }) {
  const def = SETTING_DEFS.find((d) => d.key === keyName);
  if (!def) return null;

  if (def.type === "bool") {
    return (
      <div className="checkbox">
        <input id={def.key} name={def.key} type="checkbox" defaultChecked={value === "1"} />
        <label htmlFor={def.key}>{def.label}</label>
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={def.key}>{def.label}</label>
      {def.type === "textarea" ? (
        <textarea id={def.key} name={def.key} defaultValue={value} />
      ) : (
        <input
          id={def.key}
          name={def.key}
          type={def.type === "password" ? "password" : def.type === "number" ? "number" : "text"}
          defaultValue={value}
          className={def.type === "number" ? "ltr" : undefined}
        />
      )}
      {def.hint ? <span className="field-hint">{def.hint}</span> : null}
    </div>
  );
}

/** تنظیمات دست‌نخورده باید در فرم بمانند، وگرنه ذخیرهٔ بخشی، بقیه را خالی می‌کند */
function HiddenRest({ except, values }: { except: string[]; values: Record<string, string> }) {
  return (
    <>
      {SETTING_DEFS.filter((d) => !except.includes(d.key)).map((def) =>
        def.type === "bool" ? (
          <input key={def.key} type="hidden" name={def.key} value={values[def.key] === "1" ? "on" : ""} />
        ) : (
          <input key={def.key} type="hidden" name={def.key} value={values[def.key] ?? ""} />
        ),
      )}
    </>
  );
}

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; type?: string; gateway?: string; wallet?: string }>;
}) {
  const { msg, type, gateway: editGateway, wallet: editWallet } = await searchParams;

  const [settings, gateways, wallets, rate, legacyPending] = await Promise.all([
    getSettings(),
    db.gateway.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.cryptoWallet.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    usdtRate(),
    (async () => {
      const count = await db.gateway.count();
      const s = await getSettings();
      return count === 0 && Boolean(s.gateway_key?.trim());
    })(),
  ]);

  const editingGateway = editGateway ? gateways.find((g) => g.id === editGateway) : null;
  const editingWallet = editWallet ? wallets.find((w) => w.id === editWallet) : null;
  const editingConfig = (() => {
    try {
      return editingGateway?.config
        ? (JSON.parse(editingGateway.config) as { feeMode?: string; custom?: unknown })
        : {};
    } catch {
      return {};
    }
  })();

  const activeGatewayCount = gateways.filter((g) => g.isActive && gatewayUsable(g)).length;
  const activeWalletCount = wallets.filter((w) => w.isActive).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>روش‌های پرداخت</h1>
          <p>کارت‌به‌کارت، کیف پول، درگاه‌های آنلاین و ارز دیجیتال — همه از همین‌جا.</p>
        </div>
        <Link className="btn btn-sm" href="/admin/orders?status=pending_review">
          سفارش‌های در انتظار بررسی
        </Link>
      </div>

      <Flash msg={msg} type={type} />

      <div className="summary-strip">
        <div className="summary-tile">
          <span>💳 کارت‌به‌کارت</span>
          <b>{asBool(settings.card_enabled) ? "فعال" : "خاموش"}</b>
        </div>
        <div className="summary-tile">
          <span>💰 کیف پول</span>
          <b>{asBool(settings.wallet_enabled) ? "فعال" : "خاموش"}</b>
        </div>
        <div className="summary-tile">
          <span>🏦 درگاه آنلاین</span>
          <b>{activeGatewayCount ? `${faNum(activeGatewayCount)} فعال` : "خاموش"}</b>
        </div>
        <div className="summary-tile">
          <span>🪙 ارز دیجیتال</span>
          <b>
            {asBool(settings.crypto_enabled) && activeWalletCount
              ? `${faNum(activeWalletCount)} آدرس`
              : "خاموش"}
          </b>
        </div>
      </div>

      {/* ---------------------------- درگاه‌های آنلاین ---------------------------- */}
      <div className="card">
        <div className="card-title">
          <h3>🏦 درگاه‌های پرداخت آنلاین</h3>
          {editingGateway ? (
            <Link className="btn btn-sm" href="/admin/payments">
              + افزودن درگاه تازه
            </Link>
          ) : (
            <span className="badge badge-info">{faNum(gateways.length)} درگاه</span>
          )}
        </div>

        {legacyPending ? (
          <div className="alert alert-warn">
            یک درگاه در تنظیمات قدیمی دارید که هنوز به این فهرست منتقل نشده است.
            <div style={{ marginTop: 8 }}>
              <ActionForm
                action={importLegacyGatewayAction}
                submitLabel="انتقال درگاه قبلی"
                buttonClass="btn btn-sm btn-primary"
                inline
              />
            </div>
          </div>
        ) : null}

        {gateways.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>درگاه</th>
                  <th>درایور</th>
                  <th>محدودهٔ مبلغ</th>
                  <th>وضعیت</th>
                  <th>اقدام</th>
                </tr>
              </thead>
              <tbody>
                {gateways.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="cell-main">{row.label}</span>
                      {row.note ? <span className="cell-sub">{row.note}</span> : null}
                    </td>
                    <td className="nowrap">
                      {DRIVERS.find((d) => d.id === row.driver)?.label ?? row.driver}
                      {row.sandbox ? <span className="badge badge-warn">آزمایشی</span> : null}
                    </td>
                    <td className="nowrap">
                      <span className="cell-main">از {toman(row.minAmount)}</span>
                      <span className="cell-sub">
                        {row.maxAmount > 0 ? `تا ${toman(row.maxAmount)}` : "بدون سقف"}
                      </span>
                    </td>
                    <td>
                      {!gatewayUsable(row) && row.isActive ? (
                        <span className="badge badge-warn">تنظیم ناقص</span>
                      ) : (
                        <span className={`badge ${row.isActive ? "badge-success" : "badge"}`}>
                          {row.isActive ? "فعال" : "خاموش"}
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="cell-actions">
                        <Link className="btn btn-sm" href={`/admin/payments?gateway=${row.id}`}>
                          ویرایش
                        </Link>
                        <ActionForm
                          action={toggleGatewayAction}
                          submitLabel={row.isActive ? "خاموش" : "فعال"}
                          buttonClass="btn btn-sm"
                          inline
                        >
                          <input type="hidden" name="id" value={row.id} />
                        </ActionForm>
                        <ActionForm
                          action={deleteGatewayAction}
                          submitLabel="حذف"
                          buttonClass="btn btn-sm btn-danger"
                          confirm="این درگاه حذف شود؟"
                          inline
                        >
                          <input type="hidden" name="id" value={row.id} />
                        </ActionForm>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dim">هنوز درگاهی اضافه نشده است؛ از فرم زیر اولین درگاه را بسازید.</p>
        )}

        <hr />
        <div className="card-title">
          <h3>{editingGateway ? `ویرایش «${editingGateway.label}»` : "افزودن درگاه"}</h3>
        </div>
        <ActionForm action={saveGatewayAction} submitLabel={editingGateway ? "ذخیره درگاه" : "افزودن درگاه"}>
          {editingGateway ? <input type="hidden" name="id" value={editingGateway.id} /> : null}
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="driver">درایور</label>
              <select id="driver" name="driver" defaultValue={editingGateway?.driver ?? "hooshpay"}>
                {DRIVERS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              <span className="field-hint">
                کلید هر درگاه: {DRIVERS.map((d) => `${d.label} → ${d.keyLabel}`).join(" · ")}
              </span>
            </div>
            <div className="field">
              <label htmlFor="label">نامی که به مشتری نشان داده می‌شود</label>
              <input id="label" name="label" defaultValue={editingGateway?.label ?? ""} placeholder="مثلاً پرداخت آنلاین" />
            </div>
            <div className="field">
              <label htmlFor="apiKey">کلید / مرچنت</label>
              <input
                id="apiKey"
                name="apiKey"
                type="password"
                defaultValue={editingGateway?.apiKey ?? ""}
                className="ltr"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="apiSecret">کلید محرمانه (Secret)</label>
              <input
                id="apiSecret"
                name="apiSecret"
                type="password"
                defaultValue={editingGateway?.apiSecret ?? ""}
                className="ltr"
                autoComplete="off"
              />
              <span className="field-hint">هوش‌پی برای امضای وب‌هوک از این کلید استفاده می‌کند.</span>
            </div>
            <div className="field">
              <label htmlFor="feeMode">کارمزد را چه کسی بدهد (هوش‌پی)</label>
              <select id="feeMode" name="feeMode" defaultValue={editingConfig.feeMode ?? "buyer"}>
                <option value="buyer">خریدار (به مبلغ مشتری اضافه می‌شود)</option>
                <option value="seller">فروشنده (از سهم شما کم می‌شود)</option>
                <option value="split">نصف‌نصف</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="minAmount">حداقل مبلغ (تومان)</label>
              <input
                id="minAmount"
                name="minAmount"
                type="number"
                min={0}
                defaultValue={editingGateway?.minAmount ?? 10000}
                className="ltr"
              />
            </div>
            <div className="field">
              <label htmlFor="maxAmount">حداکثر مبلغ (تومان)</label>
              <input
                id="maxAmount"
                name="maxAmount"
                type="number"
                min={0}
                defaultValue={editingGateway?.maxAmount ?? 0}
                className="ltr"
              />
              <span className="field-hint">صفر یعنی بدون سقف.</span>
            </div>
            <div className="field">
              <label htmlFor="sortOrder">ترتیب نمایش</label>
              <input
                id="sortOrder"
                name="sortOrder"
                type="number"
                defaultValue={editingGateway?.sortOrder ?? 0}
                className="ltr"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="custom">تنظیمات درگاه دلخواه (JSON)</label>
            <textarea
              id="custom"
              name="custom"
              className="ltr"
              defaultValue={editingConfig.custom ? JSON.stringify(editingConfig.custom, null, 2) : ""}
              placeholder='{"requestUrl":"…","verifyUrl":"…","startUrl":"…/{ref}","refPath":"data.token"}'
            />
            <span className="field-hint">فقط وقتی درایور روی «درگاه دلخواه» است لازم می‌شود.</span>
          </div>

          <div className="field">
            <label htmlFor="note">یادداشت داخلی</label>
            <input id="note" name="note" defaultValue={editingGateway?.note ?? ""} />
          </div>

          <div className="checkbox">
            <input
              id="sandbox"
              name="sandbox"
              type="checkbox"
              defaultChecked={editingGateway?.sandbox ?? false}
            />
            <label htmlFor="sandbox">حالت آزمایشی (Sandbox)</label>
          </div>
          <div className="checkbox">
            <input
              id="isActive"
              name="isActive"
              type="checkbox"
              defaultChecked={editingGateway?.isActive ?? true}
            />
            <label htmlFor="isActive">فعال باشد</label>
          </div>
        </ActionForm>
      </div>

      {/* ------------------------------ ارز دیجیتال ------------------------------ */}
      <div className="card">
        <div className="card-title">
          <h3>🪙 ارز دیجیتال (تتر TRC20)</h3>
          <span className={`badge ${rate.toman > 0 ? "badge-success" : "badge-warn"}`}>
            {rate.toman > 0 ? `هر تتر ${toman(rate.toman)}` : "نرخ تنظیم نشده"}
          </span>
        </div>
        <p className="field-hint">
          مشتری تتر را به یکی از آدرس‌های زیر می‌فرستد و هش تراکنش را ثبت می‌کند؛ شما در صفحهٔ سفارش‌ها
          بررسی و تأیید می‌کنید. مبلغ تتری هر سفارش با نرخ لحظهٔ ثبت قفل می‌شود.
        </p>

        <div className="mon-facts">
          <span>
            <small>نرخ فعلی (با حاشیه)</small>
            <b>{rate.toman > 0 ? toman(rate.toman) : "—"}</b>
          </span>
          <span>
            <small>منبع</small>
            <b>{rate.source === "auto" ? "خودکار" : "دستی"}</b>
          </span>
          <span>
            <small>آخرین به‌روزرسانی</small>
            <b>{rate.fetchedAt ? faDate(rate.fetchedAt, true) : "—"}</b>
          </span>
          <span>
            <small>حاشیهٔ امن</small>
            <b>{faNum(rate.margin)}٪</b>
          </span>
        </div>

        <div className="btn-row" style={{ marginBottom: 14 }}>
          <ActionForm
            action={refreshRateAction}
            submitLabel="🔄 گرفتن نرخ تازه"
            buttonClass="btn btn-sm btn-primary"
            inline
          />
        </div>

        {wallets.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>آدرس</th>
                  <th>شبکه</th>
                  <th>وضعیت</th>
                  <th>اقدام</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span className="cell-main mono ltr">{row.address}</span>
                      {row.label ? <span className="cell-sub">{row.label}</span> : null}
                    </td>
                    <td className="nowrap">
                      {row.symbol} · {row.network.toUpperCase()}
                    </td>
                    <td>
                      <span className={`badge ${row.isActive ? "badge-success" : "badge"}`}>
                        {row.isActive ? "فعال" : "خاموش"}
                      </span>
                    </td>
                    <td>
                      <div className="cell-actions">
                        <Link className="btn btn-sm" href={`/admin/payments?wallet=${row.id}`}>
                          ویرایش
                        </Link>
                        <ActionForm
                          action={deleteWalletAction}
                          submitLabel="حذف"
                          buttonClass="btn btn-sm btn-danger"
                          confirm="این آدرس حذف شود؟"
                          inline
                        >
                          <input type="hidden" name="id" value={row.id} />
                        </ActionForm>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="dim">هنوز آدرسی ثبت نشده است؛ بدون آدرس، پرداخت تتری به مشتری پیشنهاد نمی‌شود.</p>
        )}

        <hr />
        <div className="card-title">
          <h3>{editingWallet ? "ویرایش آدرس" : "افزودن آدرس کیف پول"}</h3>
        </div>
        <ActionForm action={saveWalletAction} submitLabel={editingWallet ? "ذخیره آدرس" : "افزودن آدرس"}>
          {editingWallet ? <input type="hidden" name="id" value={editingWallet.id} /> : null}
          <div className="field">
            <label htmlFor="address">آدرس کیف پول</label>
            <input
              id="address"
              name="address"
              className="ltr mono"
              defaultValue={editingWallet?.address ?? ""}
              placeholder="TXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
              autoComplete="off"
            />
            <span className="field-hint">
              فقط آدرس شبکهٔ ترون (TRC20) — با حرف T شروع می‌شود و ۳۴ کاراکتر است.
            </span>
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="network">شبکه</label>
              <select id="network" name="network" defaultValue={editingWallet?.network ?? "trc20"}>
                <option value="trc20">TRC20 (ترون)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="symbol">ارز</label>
              <input id="symbol" name="symbol" className="ltr" defaultValue={editingWallet?.symbol ?? "USDT"} />
            </div>
            <div className="field">
              <label htmlFor="wallet-label">برچسب</label>
              <input id="wallet-label" name="label" defaultValue={editingWallet?.label ?? ""} placeholder="مثلاً کیف پول اصلی" />
            </div>
            <div className="field">
              <label htmlFor="wallet-sort">ترتیب</label>
              <input
                id="wallet-sort"
                name="sortOrder"
                type="number"
                className="ltr"
                defaultValue={editingWallet?.sortOrder ?? 0}
              />
            </div>
          </div>
          <div className="checkbox">
            <input
              id="wallet-active"
              name="isActive"
              type="checkbox"
              defaultChecked={editingWallet?.isActive ?? true}
            />
            <label htmlFor="wallet-active">فعال باشد</label>
          </div>
        </ActionForm>

        <hr />
        <ActionForm action={saveSettingsAction} submitLabel="ذخیره تنظیمات ارز دیجیتال">
          <HiddenRest except={CRYPTO_KEYS} values={settings} />
          <div className="grid grid-2">
            {CRYPTO_KEYS.map((key) => (
              <SettingField key={key} keyName={key} value={settings[key] ?? ""} />
            ))}
          </div>
        </ActionForm>
      </div>

      {/* ---------------------------- کارت‌به‌کارت ---------------------------- */}
      <div className="card">
        <div className="card-title">
          <h3>💳 کارت‌به‌کارت</h3>
          <span className={`badge ${asBool(settings.card_enabled) ? "badge-success" : "badge"}`}>
            {asBool(settings.card_enabled) ? "فعال" : "خاموش"}
          </span>
        </div>
        <ActionForm action={saveSettingsAction} submitLabel="ذخیره کارت‌به‌کارت">
          <HiddenRest except={CARD_KEYS} values={settings} />
          <div className="grid grid-2">
            {CARD_KEYS.map((key) => (
              <SettingField key={key} keyName={key} value={settings[key] ?? ""} />
            ))}
          </div>
        </ActionForm>
      </div>

      {/* ------------------------------- کیف پول ------------------------------- */}
      <div className="card">
        <div className="card-title">
          <h3>💰 کیف پول</h3>
          <span className={`badge ${asBool(settings.wallet_enabled) ? "badge-success" : "badge"}`}>
            {asBool(settings.wallet_enabled) ? "فعال" : "خاموش"}
          </span>
        </div>
        <p className="field-hint">
          شارژ کیف پول با همهٔ روش‌های بالا ممکن است؛ بعد از شارژ، خریدها بدون انتظار انجام می‌شوند.
          حداقل مبلغ فعلی: {toman(asNum(settings.min_topup, 50_000))}
        </p>
        <ActionForm action={saveSettingsAction} submitLabel="ذخیره کیف پول">
          <HiddenRest except={WALLET_KEYS} values={settings} />
          <div className="grid grid-2">
            {WALLET_KEYS.map((key) => (
              <SettingField key={key} keyName={key} value={settings[key] ?? ""} />
            ))}
          </div>
        </ActionForm>
      </div>
    </div>
  );
}
