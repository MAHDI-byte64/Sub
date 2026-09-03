import "server-only";
import { asBool, asNum, getSettings, type Settings } from "./settings";

/**
 * لایهٔ درگاه پرداخت آنلاین.
 *
 * هر درگاه ایرانی همین سه مرحله را دارد و فقط در نام فیلدها فرق می‌کند:
 *   ۱) درخواست پرداخت  → گرفتن یک «کد پیگیری» (authority / trackId / trans_id)
 *   ۲) فرستادن کاربر به آدرس پرداخت درگاه
 *   ۳) بازگشت کاربر به سایت و «تأیید» تراکنش با همان کد
 *
 * درایور `custom` همین مراحل را با آدرس‌ها و نام فیلدهای دلخواه انجام می‌دهد،
 * تا درگاهی که درایور آماده ندارد هم فقط با تنظیمات وصل شود.
 */

export class GatewayError extends Error {}

export type StartInput = {
  /** مبلغ به تومان */
  amount: number;
  orderCode: string;
  description: string;
  callbackUrl: string;
  email?: string | null;
  mobile?: string | null;
};

export type StartResult = { payUrl: string; ref: string };

export type VerifyInput = {
  /** کد پیگیری‌ای که موقع شروع پرداخت ذخیره شده */
  ref: string;
  /** مبلغ به تومان */
  amount: number;
  orderCode: string;
  /** پارامترهای بازگشتی درگاه (query یا body) */
  params: Record<string, string>;
};

export type VerifyResult = { ok: boolean; refId: string; message: string };

export type GatewayConfig = {
  driver: string;
  key: string;
  /** کلید محرمانه (فعلاً فقط هوش‌پی برای امضای وب‌هوک) */
  secret: string;
  sandbox: boolean;
  /** hooshpay: seller | buyer | split */
  feeMode: string;
  custom: CustomConfig;
};

/** پیکربندی درایور دلخواه (JSON در تنظیمات) */
export type CustomConfig = {
  requestUrl: string;
  verifyUrl: string;
  /** الگوی آدرس پرداخت؛ {ref} با کد پیگیری جایگزین می‌شود */
  startUrl: string;
  /** واحد مبلغ درخواستی درگاه */
  currency: "toman" | "rial";
  /** none = کلید داخل بدنه می‌رود */
  auth: "none" | "bearer" | "header";
  /** نام هدر وقتی auth=header (مثلاً X-API-KEY) */
  authHeader: string;
  /** نام فیلد کلید داخل بدنه وقتی auth=none (مثلاً merchant_id) */
  keyField: string;
  /** نام فیلدهای بدنهٔ درخواست */
  amountField: string;
  callbackField: string;
  orderField: string;
  descriptionField: string;
  /** مسیر کد پیگیری در پاسخ، با نقطه (مثلاً data.authority) */
  refPath: string;
  /** مسیر و مقداری که یعنی «موفق» (خالی = فقط وجود کد پیگیری کافی است) */
  successPath: string;
  successValue: string;
  /** نام پارامتر کد پیگیری در بازگشت درگاه */
  callbackRefParam: string;
  /** مسیر شمارهٔ پیگیری بانکی در پاسخ تأیید */
  verifyRefPath: string;
  /** فیلدهای اضافهٔ ثابت که در هر دو درخواست فرستاده می‌شوند */
  extra: Record<string, string | number>;
};

export const DEFAULT_CUSTOM: CustomConfig = {
  requestUrl: "",
  verifyUrl: "",
  startUrl: "",
  currency: "rial",
  auth: "none",
  authHeader: "X-API-KEY",
  keyField: "merchant_id",
  amountField: "amount",
  callbackField: "callback_url",
  orderField: "order_id",
  descriptionField: "description",
  refPath: "authority",
  successPath: "",
  successValue: "",
  callbackRefParam: "authority",
  verifyRefPath: "ref_id",
  extra: {},
};

/* -------------------------------------------------------------------------- */
/*                                 ابزارها                                    */
/* -------------------------------------------------------------------------- */

function pick(source: unknown, path: string): unknown {
  if (!path) return undefined;
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, source);
}

function text(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown; raw: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...headers },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new GatewayError(`ارتباط با درگاه پرداخت برقرار نشد: ${(err as Error).message}`);
  }
  const raw = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(raw);
  } catch {
    /* بعضی درگاه‌ها در خطا HTML برمی‌گردانند */
  }
  return { status: res.status, json, raw };
}

const rial = (toman: number) => Math.round(toman) * 10;

/** آدرس پایهٔ هوش‌پی؛ فقط برای تست با سرور شبیه‌سازی‌شده قابل تغییر است */
const hooshpayBase = () =>
  (process.env.HOOSHPAY_BASE || "https://hooshpay.xyz").replace(/\/+$/, "");

/* -------------------------------------------------------------------------- */
/*                                 درایورها                                   */
/* -------------------------------------------------------------------------- */

export type Driver = {
  id: string;
  label: string;
  /** راهنمای فیلد «کلید» در تنظیمات */
  keyLabel: string;
  start(input: StartInput, cfg: GatewayConfig): Promise<StartResult>;
  verify(input: VerifyInput, cfg: GatewayConfig): Promise<VerifyResult>;
};

/** زرین‌پال — API نسخه ۴ */
const zarinpal: Driver = {
  id: "zarinpal",
  label: "زرین‌پال",
  keyLabel: "مرچنت کد (Merchant ID)",
  async start(input, cfg) {
    const base = cfg.sandbox ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com";
    const { json } = await postJson(`${base}/pg/v4/payment/request.json`, {
      merchant_id: cfg.key,
      amount: rial(input.amount),
      callback_url: input.callbackUrl,
      description: input.description,
      metadata: { email: input.email ?? "", mobile: input.mobile ?? "" },
    });
    const authority = text(pick(json, "data.authority"));
    const code = Number(pick(json, "data.code"));
    if (!authority || (code !== 100 && code !== 101)) {
      throw new GatewayError(
        `زرین‌پال درخواست پرداخت را نپذیرفت: ${text(pick(json, "errors.message")) || text(pick(json, "data.message")) || "خطای نامشخص"}`,
      );
    }
    return { payUrl: `${base}/pg/StartPay/${authority}`, ref: authority };
  },
  async verify(input, cfg) {
    const base = cfg.sandbox ? "https://sandbox.zarinpal.com" : "https://payment.zarinpal.com";
    if ((input.params.Status ?? input.params.status) !== "OK") {
      return { ok: false, refId: "", message: "پرداخت توسط کاربر لغو شد." };
    }
    const { json } = await postJson(`${base}/pg/v4/payment/verify.json`, {
      merchant_id: cfg.key,
      amount: rial(input.amount),
      authority: input.ref,
    });
    const code = Number(pick(json, "data.code"));
    const refId = text(pick(json, "data.ref_id"));
    if (code === 100 || code === 101) {
      return { ok: true, refId, message: code === 101 ? "قبلاً تأیید شده بود." : "پرداخت تأیید شد." };
    }
    return {
      ok: false,
      refId: "",
      message: text(pick(json, "errors.message")) || "تأیید تراکنش ناموفق بود.",
    };
  },
};

/** آی‌دی‌پی — API نسخه ۱.۱ */
const idpay: Driver = {
  id: "idpay",
  label: "آی‌دی‌پی (IDPay)",
  keyLabel: "کلید API",
  async start(input, cfg) {
    const headers: Record<string, string> = {
      "X-API-KEY": cfg.key,
      ...(cfg.sandbox ? { "X-SANDBOX": "1" } : {}),
    };
    const { json } = await postJson(
      "https://api.idpay.ir/v1.1/payment",
      {
        order_id: input.orderCode,
        amount: rial(input.amount),
        callback: input.callbackUrl,
        desc: input.description,
        mail: input.email ?? "",
        phone: input.mobile ?? "",
      },
      headers,
    );
    const id = text(pick(json, "id"));
    const link = text(pick(json, "link"));
    if (!id || !link) {
      throw new GatewayError(
        `آی‌دی‌پی درخواست پرداخت را نپذیرفت: ${text(pick(json, "error_message")) || "خطای نامشخص"}`,
      );
    }
    return { payUrl: link, ref: id };
  },
  async verify(input, cfg) {
    const headers: Record<string, string> = {
      "X-API-KEY": cfg.key,
      ...(cfg.sandbox ? { "X-SANDBOX": "1" } : {}),
    };
    const { json } = await postJson(
      "https://api.idpay.ir/v1.1/payment/verify",
      { id: input.ref, order_id: input.orderCode },
      headers,
    );
    const status = Number(pick(json, "status"));
    if (status === 100 || status === 101 || status === 200) {
      return { ok: true, refId: text(pick(json, "track_id")), message: "پرداخت تأیید شد." };
    }
    return {
      ok: false,
      refId: "",
      message: text(pick(json, "error_message")) || `تأیید تراکنش ناموفق بود (کد ${status}).`,
    };
  },
};

/** زیبال */
const zibal: Driver = {
  id: "zibal",
  label: "زیبال (Zibal)",
  keyLabel: "مرچنت (برای تست: zibal)",
  async start(input, cfg) {
    const { json } = await postJson("https://gateway.zibal.ir/v1/request", {
      merchant: cfg.sandbox ? "zibal" : cfg.key,
      amount: rial(input.amount),
      callbackUrl: input.callbackUrl,
      orderId: input.orderCode,
      description: input.description,
      mobile: input.mobile ?? "",
    });
    const trackId = text(pick(json, "trackId"));
    if (Number(pick(json, "result")) !== 100 || !trackId) {
      throw new GatewayError(
        `زیبال درخواست پرداخت را نپذیرفت: ${text(pick(json, "message")) || "خطای نامشخص"}`,
      );
    }
    return { payUrl: `https://gateway.zibal.ir/start/${trackId}`, ref: trackId };
  },
  async verify(input, cfg) {
    const { json } = await postJson("https://gateway.zibal.ir/v1/verify", {
      merchant: cfg.sandbox ? "zibal" : cfg.key,
      trackId: input.ref,
    });
    const result = Number(pick(json, "result"));
    if (result === 100 || result === 201) {
      return {
        ok: true,
        refId: text(pick(json, "refNumber")) || input.ref,
        message: result === 201 ? "قبلاً تأیید شده بود." : "پرداخت تأیید شد.",
      };
    }
    return { ok: false, refId: "", message: text(pick(json, "message")) || "تأیید تراکنش ناموفق بود." };
  },
};

/** پی‌پینگ — مبلغ به تومان */
const payping: Driver = {
  id: "payping",
  label: "پی‌پینگ (PayPing)",
  keyLabel: "توکن API",
  async start(input, cfg) {
    const { json } = await postJson(
      "https://api.payping.ir/v2/pay",
      {
        amount: Math.round(input.amount),
        returnUrl: input.callbackUrl,
        clientRefId: input.orderCode,
        description: input.description,
        payerIdentity: input.email ?? input.mobile ?? "",
      },
      { Authorization: `Bearer ${cfg.key}` },
    );
    const code = text(pick(json, "code"));
    if (!code) {
      throw new GatewayError(
        `پی‌پینگ درخواست پرداخت را نپذیرفت: ${text(pick(json, "Error")) || "خطای نامشخص"}`,
      );
    }
    return { payUrl: `https://api.payping.ir/v2/pay/gotoipg/${code}`, ref: code };
  },
  async verify(input, cfg) {
    const refId = input.params.refid || input.params.refId || input.ref;
    const { json, status } = await postJson(
      "https://api.payping.ir/v2/pay/verify",
      { refId, amount: Math.round(input.amount) },
      { Authorization: `Bearer ${cfg.key}` },
    );
    if (status >= 200 && status < 300) {
      return { ok: true, refId: text(pick(json, "cardNumber")) || refId, message: "پرداخت تأیید شد." };
    }
    return { ok: false, refId: "", message: text(pick(json, "Error")) || "تأیید تراکنش ناموفق بود." };
  },
};

/** نکست‌پی */
const nextpay: Driver = {
  id: "nextpay",
  label: "نکست‌پی (NextPay)",
  keyLabel: "کلید API",
  async start(input, cfg) {
    const { json } = await postJson("https://nextpay.org/nx/gateway/token", {
      api_key: cfg.key,
      order_id: input.orderCode,
      amount: rial(input.amount),
      callback_uri: input.callbackUrl,
      customer_phone: input.mobile ?? "",
    });
    const transId = text(pick(json, "trans_id"));
    const code = Number(pick(json, "code"));
    if (!transId || code !== -1) {
      throw new GatewayError(`نکست‌پی درخواست پرداخت را نپذیرفت (کد ${code}).`);
    }
    return { payUrl: `https://nextpay.org/nx/gateway/payment/${transId}`, ref: transId };
  },
  async verify(input, cfg) {
    const { json } = await postJson("https://nextpay.org/nx/gateway/verify", {
      api_key: cfg.key,
      trans_id: input.ref,
      amount: rial(input.amount),
    });
    const code = Number(pick(json, "code"));
    if (code === 0) {
      return { ok: true, refId: text(pick(json, "Shaparak_Ref_Id")) || input.ref, message: "پرداخت تأیید شد." };
    }
    return { ok: false, refId: "", message: `تأیید تراکنش ناموفق بود (کد ${code}).` };
  },
};

/**
 * هوش‌پی — درگاه واسط کارت‌به‌کارت با تأیید آنی
 * مستندات: https://hooshpay.xyz/developers
 *
 * مبلغ‌ها به تومان‌اند و «مبلغ قابل پرداخت» (payable_amount) با مبلغ فاکتور فرق
 * دارد؛ هوش‌پی چند تومان اختلاف می‌گذارد تا تراکنش را دقیق تطبیق دهد و کارمزد
 * هم بر اساس fee_mode جابه‌جا می‌شود. پس هرگز خودمان مبلغ را چک نمی‌کنیم و
 * تصمیم را به متد verify خود هوش‌پی می‌سپاریم.
 */
const hooshpay: Driver = {
  id: "hooshpay",
  label: "هوش‌پی (HooshPay)",
  keyLabel: "کلید API (hp_live_…)",
  async start(input, cfg) {
    const { json, raw } = await postJson(
      `${hooshpayBase()}/api/v1/invoices`,
      {
        amount: Math.round(input.amount),
        fee_mode: cfg.feeMode || "buyer",
        order_id: input.orderCode,
        description: input.description,
        callback_url: input.callbackUrl.replace("/api/pay/callback/", "/api/pay/hooshpay/"),
        return_url: input.callbackUrl,
      },
      { "X-API-KEY": cfg.key },
    );

    const uid = text(pick(json, "data.uid"));
    const payUrl = text(pick(json, "data.payment_url"));
    if (pick(json, "success") !== true || !uid || !payUrl) {
      throw new GatewayError(
        `هوش‌پی فاکتور را نساخت: ${text(pick(json, "message")) || text(pick(json, "error")) || raw.slice(0, 120)}`,
      );
    }
    return { payUrl, ref: uid };
  },
  async verify(input, cfg) {
    const { json, raw } = await postJson(
      `${hooshpayBase()}/api/v1/invoices/${encodeURIComponent(input.ref)}/verify`,
      {},
      { "X-API-KEY": cfg.key },
    );

    const paid = pick(json, "paid") === true || text(pick(json, "status")) === "paid";
    if (paid) {
      return {
        ok: true,
        refId: text(pick(json, "data.tracking_code")) || input.ref,
        message: "پرداخت تأیید شد.",
      };
    }
    const status = text(pick(json, "status")) || text(pick(json, "data.status"));
    return {
      ok: false,
      refId: "",
      message:
        status === "pending"
          ? "پرداخت هنوز انجام نشده است."
          : status === "expired"
            ? "مهلت پرداخت فاکتور تمام شده است."
            : status === "cancelled"
              ? "فاکتور لغو شده است."
              : `تأیید تراکنش ناموفق بود (${status || raw.slice(0, 80)}).`,
    };
  },
};

/** درایور دلخواه: هر درگاهی که همین سه مرحله را داشته باشد */
const custom: Driver = {
  id: "custom",
  label: "درگاه دلخواه (تنظیم دستی)",
  keyLabel: "کلید / توکن درگاه",
  async start(input, cfg) {
    const c = cfg.custom;
    if (!c.requestUrl || !c.startUrl) {
      throw new GatewayError("آدرس درخواست و آدرس پرداخت درگاه دلخواه تنظیم نشده است.");
    }
    const amount = c.currency === "toman" ? Math.round(input.amount) : rial(input.amount);
    const body: Record<string, unknown> = {
      ...c.extra,
      [c.amountField]: amount,
      [c.callbackField]: input.callbackUrl,
      [c.orderField]: input.orderCode,
      [c.descriptionField]: input.description,
    };
    const headers: Record<string, string> = {};
    if (c.auth === "bearer") headers.Authorization = `Bearer ${cfg.key}`;
    else if (c.auth === "header") headers[c.authHeader || "X-API-KEY"] = cfg.key;
    else body[c.keyField || "merchant_id"] = cfg.key;

    const { json, raw } = await postJson(c.requestUrl, body, headers);
    if (c.successPath) {
      const value = text(pick(json, c.successPath));
      if (value !== c.successValue) {
        throw new GatewayError(`درگاه درخواست پرداخت را نپذیرفت (${value || raw.slice(0, 120)}).`);
      }
    }
    const ref = text(pick(json, c.refPath));
    if (!ref) throw new GatewayError("کد پیگیری در پاسخ درگاه پیدا نشد؛ مسیر «کد پیگیری» را بررسی کنید.");

    return { payUrl: c.startUrl.replace("{ref}", encodeURIComponent(ref)), ref };
  },
  async verify(input, cfg) {
    const c = cfg.custom;
    if (!c.verifyUrl) throw new GatewayError("آدرس تأیید درگاه دلخواه تنظیم نشده است.");

    const amount = c.currency === "toman" ? Math.round(input.amount) : rial(input.amount);
    const body: Record<string, unknown> = {
      ...c.extra,
      [c.callbackRefParam || "authority"]: input.ref,
      [c.amountField]: amount,
      [c.orderField]: input.orderCode,
    };
    const headers: Record<string, string> = {};
    if (c.auth === "bearer") headers.Authorization = `Bearer ${cfg.key}`;
    else if (c.auth === "header") headers[c.authHeader || "X-API-KEY"] = cfg.key;
    else body[c.keyField || "merchant_id"] = cfg.key;

    const { json, raw } = await postJson(c.verifyUrl, body, headers);
    const okByPath = c.successPath ? text(pick(json, c.successPath)) === c.successValue : true;
    const refId = text(pick(json, c.verifyRefPath)) || input.ref;
    return okByPath
      ? { ok: true, refId, message: "پرداخت تأیید شد." }
      : { ok: false, refId: "", message: `تأیید تراکنش ناموفق بود (${raw.slice(0, 120)}).` };
  },
};

export const DRIVERS: Driver[] = [hooshpay, zarinpal, idpay, zibal, payping, nextpay, custom];

export function findDriver(id: string): Driver | null {
  return DRIVERS.find((d) => d.id === id) ?? null;
}

/* -------------------------------------------------------------------------- */
/*                            خواندن تنظیمات درگاه                             */
/* -------------------------------------------------------------------------- */

export function parseCustomConfig(raw: string | undefined): CustomConfig {
  if (!raw?.trim()) return { ...DEFAULT_CUSTOM };
  try {
    const parsed = JSON.parse(raw) as Partial<CustomConfig>;
    return { ...DEFAULT_CUSTOM, ...parsed, extra: parsed.extra ?? {} };
  } catch {
    return { ...DEFAULT_CUSTOM };
  }
}

export function gatewayConfig(settings: Settings): GatewayConfig {
  return {
    driver: settings.gateway_driver || "zarinpal",
    key: settings.gateway_key || "",
    secret: settings.gateway_secret || "",
    sandbox: asBool(settings.gateway_sandbox),
    feeMode: settings.gateway_fee_mode || "buyer",
    custom: parseCustomConfig(settings.gateway_custom),
  };
}

/** آیا پرداخت آنلاین برای مشتری فعال است؟ */
export function gatewayReady(settings: Settings): boolean {
  if (!asBool(settings.gateway_enabled)) return false;
  const cfg = gatewayConfig(settings);
  const driver = findDriver(cfg.driver);
  if (!driver) return false;
  if (driver.id === "custom") return Boolean(cfg.custom.requestUrl && cfg.custom.startUrl);
  if (driver.id === "zibal" && cfg.sandbox) return true;
  return Boolean(cfg.key);
}

/** حداقل مبلغ مجاز برای پرداخت آنلاین (تومان) */
export function gatewayMin(settings: Settings): number {
  return Math.max(1000, asNum(settings.gateway_min_amount, 10_000));
}

export async function startPayment(input: StartInput): Promise<StartResult & { driver: string }> {
  const settings = await getSettings();
  if (!gatewayReady(settings)) throw new GatewayError("پرداخت آنلاین در حال حاضر فعال نیست.");

  const cfg = gatewayConfig(settings);
  const driver = findDriver(cfg.driver);
  if (!driver) throw new GatewayError("درگاه پرداخت انتخاب‌شده پشتیبانی نمی‌شود.");

  const result = await driver.start(input, cfg);
  return { ...result, driver: driver.id };
}

export async function verifyPayment(input: VerifyInput & { driver?: string }): Promise<VerifyResult> {
  const settings = await getSettings();
  const cfg = gatewayConfig(settings);
  const driver = findDriver(input.driver || cfg.driver);
  if (!driver) return { ok: false, refId: "", message: "درگاه پرداخت شناخته نشد." };

  try {
    return await driver.verify(input, cfg);
  } catch (err) {
    return { ok: false, refId: "", message: (err as Error).message };
  }
}

/** نام پارامتری که درگاه هنگام بازگشت، کد پیگیری را در آن می‌فرستد */
export function callbackRefParam(driverId: string, custom: CustomConfig): string[] {
  switch (driverId) {
    case "hooshpay":
      return ["invoice", "uid"];
    case "zarinpal":
      return ["Authority", "authority"];
    case "idpay":
      return ["id"];
    case "zibal":
      return ["trackId"];
    case "payping":
      return ["refid", "refId", "code"];
    case "nextpay":
      return ["trans_id"];
    default:
      return [custom.callbackRefParam || "authority"];
  }
}
