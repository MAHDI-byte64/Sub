import "server-only";
import http from "node:http";
import https from "node:https";

/**
 * کلاینت API پنل 3x-ui (پنل سنایی) — سازگار با هر دو نسل پنل:
 *
 * نسل ۳ (v3.x) — مستندات رسمی openapi پنل:
 *   احراز هویت: هدر `Authorization: Bearer <API Token>`
 *               (تنظیمات → امنیت → API Token) یا کوکی نشست از POST /login
 *   POST {base}/login                                  {username, password, twoFactorCode?}
 *   GET  {base}/csrf-token                             (فقط برای حالت کوکی)
 *   GET  {base}/panel/api/inbounds/options             (برای تشخیص نسل پنل)
 *   GET  {base}/panel/api/inbounds/list
 *   GET  {base}/panel/api/inbounds/get/{id}
 *   POST {base}/panel/api/clients/add                  {client, inboundIds}
 *   POST {base}/panel/api/clients/update/{email}       client
 *   POST {base}/panel/api/clients/del/{email}
 *   GET  {base}/panel/api/clients/traffic/{email}
 *   GET  {base}/panel/api/clients/links/{email}
 *   POST {base}/panel/api/clients/resetTraffic/{email}
 *
 * نسل ۲ (v2.x) — مسیرهای قدیمی:
 *   POST {base}/login  (form)
 *   POST {base}/panel/api/inbounds/addClient           {id, settings}
 *   POST {base}/panel/api/inbounds/updateClient/{uuid} {id, settings}
 *   POST {base}/panel/api/inbounds/{id}/delClient/{uuid}
 *   GET  {base}/panel/api/inbounds/getClientTraffics/{email}
 *   POST {base}/panel/api/inbounds/{id}/resetClientTraffic/{email}
 */

type RawResponse = {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: string;
};

/**
 * درخواست HTTP با ماژول داخلی Node.
 * از fetch استفاده نمی‌کنیم تا بتوانیم گواهی self-signed پنل را بپذیریم
 * (اغلب پنل‌های 3x-ui گواهی خودامضا یا HTTP ساده دارند).
 */
function rawRequest(
  target: string,
  options: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs: number;
    insecure: boolean;
  },
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(target);
    } catch {
      reject(new Error(`آدرس پنل نامعتبر است: ${target}`));
      return;
    }

    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.body !== undefined) {
      headers["Content-Length"] = String(Buffer.byteLength(options.body));
    }

    const request = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: options.method,
        headers,
        ...(isHttps && options.insecure ? { rejectUnauthorized: false } : {}),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );

    request.setTimeout(options.timeoutMs, () => {
      request.destroy(new Error("زمان انتظار پاسخ پنل تمام شد."));
    });
    request.on("error", (err) => reject(err));
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

export type XuiApiGeneration = "v2" | "v3";

export type XuiPanelConfig = {
  url: string;
  username: string;
  password: string;
  /** توکن API پنل نسخه ۳ (تنظیمات → امنیت → API Token). اگر باشد، لاگین لازم نیست. */
  apiToken?: string | null;
  /** پذیرش گواهی self-signed (پیش‌فرض: بله، چون اغلب پنل‌ها گواهی خودامضا دارند) */
  insecure?: boolean;
  timeoutMs?: number;
};

/** settings/streamSettings در نسل ۳ آبجکت و در نسل ۲ رشته JSON است */
export type XuiJsonField = string | Record<string, unknown> | null | undefined;

export type XuiInbound = {
  id: number;
  up: number;
  down: number;
  total: number;
  remark: string;
  enable: boolean;
  expiryTime: number;
  listen: string;
  port: number;
  protocol: string;
  settings: XuiJsonField;
  streamSettings: XuiJsonField;
  tag: string;
  sniffing: XuiJsonField;
  clientStats?: XuiClientStat[];
};

export type XuiClientStat = {
  id: number;
  inboundId: number;
  enable: boolean;
  email: string;
  up: number;
  down: number;
  expiryTime: number;
  total: number;
  reset?: number;
};

/** کلاینت خام همان‌طور که در settings اینباند ذخیره شده است */
export type XuiRawClient = Record<string, unknown> & { id?: string; email?: string };

/** تبدیل فیلد JSON پنل (رشته یا آبجکت) به آبجکت */
export function parseJsonField(value: XuiJsonField): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** استخراج کلاینت‌های یک اینباند از فیلد settings */
export function parseInboundClients(inbound: Pick<XuiInbound, "settings">): XuiRawClient[] {
  const settings = parseJsonField(inbound.settings) as { clients?: XuiRawClient[] };
  return Array.isArray(settings.clients) ? settings.clients : [];
}

export type XuiClientSpec = {
  id: string;
  email: string;
  subId: string;
  /** بایت؛ صفر یعنی نامحدود */
  totalGB: number;
  /** میلی‌ثانیه epoch؛ صفر یعنی بدون انقضا */
  expiryTime: number;
  limitIp: number;
  flow: string;
  enable: boolean;
  tgId: string;
  reset: number;
};

export class XuiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "XuiError";
  }
}

type ApiEnvelope<T> = { success: boolean; msg?: string; obj?: T };

type ReqInit = { method?: string; headers?: Record<string, string>; body?: string };

export class XuiClient {
  private cookie = "";
  private csrf = "";
  private loggedIn = false;
  private generation: XuiApiGeneration | null = null;

  constructor(private readonly cfg: XuiPanelConfig) {}

  /** آدرس پایه بدون اسلش انتهایی */
  get base(): string {
    return this.cfg.url.trim().replace(/\/+$/, "");
  }

  get usesToken(): boolean {
    return Boolean(this.cfg.apiToken && this.cfg.apiToken.trim());
  }

  get authMode(): "token" | "session" {
    return this.usesToken ? "token" : "session";
  }

  private get timeout(): number {
    return this.cfg.timeoutMs ?? 20_000;
  }

  private headersFor(extra?: Record<string, string>): Record<string, string> {
    return {
      Accept: "application/json, text/plain, */*",
      // پنل برای درخواست‌های XHR به‌جای 404، پاسخ 401 می‌دهد؛ خطاها گویاتر می‌شوند
      "X-Requested-With": "XMLHttpRequest",
      ...(this.usesToken ? { Authorization: `Bearer ${this.cfg.apiToken!.trim()}` } : {}),
      ...(!this.usesToken && this.cookie ? { Cookie: this.cookie } : {}),
      ...(!this.usesToken && this.csrf ? { "X-CSRF-Token": this.csrf } : {}),
      ...(extra ?? {}),
    };
  }

  private captureCookies(res: RawResponse): void {
    const raw = res.headers["set-cookie"];
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    if (!list.length) return;

    const jar = new Map<string, string>();
    for (const part of this.cookie.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k) jar.set(k, v.join("="));
    }
    for (const cookie of list) {
      const [pair] = cookie.split(";");
      const [k, ...v] = pair.trim().split("=");
      if (k) jar.set(k, v.join("="));
    }
    this.cookie = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  private send(path: string, init: ReqInit): Promise<RawResponse> {
    return rawRequest(`${this.base}${path}`, {
      method: init.method ?? "GET",
      headers: this.headersFor(init.headers),
      body: init.body,
      timeoutMs: this.timeout,
      insecure: this.cfg.insecure !== false,
    });
  }

  /** ورود با نام کاربری و رمز (وقتی توکن API نداریم) */
  async login(): Promise<void> {
    if (this.usesToken) {
      this.loggedIn = true;
      return;
    }

    const attempts: ReqInit[] = [
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: this.cfg.username, password: this.cfg.password }),
      },
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          username: this.cfg.username,
          password: this.cfg.password,
        }).toString(),
      },
    ];

    let lastMessage = "";
    for (const attempt of attempts) {
      let res: RawResponse;
      try {
        res = await this.send("/login", attempt);
      } catch (err) {
        throw new XuiError(`اتصال به پنل برقرار نشد: ${(err as Error).message}`);
      }
      this.captureCookies(res);

      let parsed: ApiEnvelope<unknown> | null = null;
      try {
        parsed = JSON.parse(res.body) as ApiEnvelope<unknown>;
      } catch {
        /* بعضی نسخه‌ها به‌جای JSON صفحه HTML برمی‌گردانند */
      }

      if (parsed?.success === false) {
        lastMessage = parsed.msg || "نام کاربری یا رمز عبور پنل اشتباه است.";
        continue;
      }
      if (res.status >= 400) {
        lastMessage = `ورود به پنل ناموفق بود (کد ${res.status}). آدرس پنل را بررسی کنید.`;
        continue;
      }
      if (this.cookie) {
        this.loggedIn = true;
        await this.fetchCsrfToken();
        return;
      }
      lastMessage = "پنل کوکی نشست برنگرداند؛ نام کاربری/رمز یا مسیر پنل (base path) را بررسی کنید.";
    }

    throw new XuiError(lastMessage || "ورود به پنل ناموفق بود.");
  }

  /** توکن CSRF لازم برای درخواست‌های POST در حالت کوکی (پنل نسخه ۳) */
  private async fetchCsrfToken(): Promise<void> {
    try {
      const res = await this.send("/csrf-token", { method: "GET" });
      const parsed = JSON.parse(res.body) as ApiEnvelope<string>;
      if (parsed.success && typeof parsed.obj === "string") this.csrf = parsed.obj;
    } catch {
      // پنل‌های نسخه ۲ این مسیر را ندارند
    }
  }

  private async ensureLogin(): Promise<void> {
    if (!this.loggedIn) await this.login();
  }

  private async request<T>(path: string, init: ReqInit = {}, retry = true): Promise<ApiEnvelope<T>> {
    await this.ensureLogin();

    let res: RawResponse;
    try {
      res = await this.send(path, init);
    } catch (err) {
      throw new XuiError(`ارتباط با پنل قطع شد: ${(err as Error).message}`);
    }
    this.captureCookies(res);

    // نشست منقضی شده → یک بار دوباره لاگین می‌کنیم (در حالت توکن معنا ندارد)
    if ((res.status === 401 || res.status === 302 || res.status === 307) && retry && !this.usesToken) {
      this.loggedIn = false;
      this.cookie = "";
      this.csrf = "";
      return this.request<T>(path, init, false);
    }
    if (res.status === 401 && this.usesToken) {
      throw new XuiError("توکن API پنل معتبر نیست یا دسترسی آن کافی نیست (scope باید admin باشد).", 401);
    }
    if (res.status === 403) {
      throw new XuiError("پنل درخواست را رد کرد (403). اگر با نام کاربری وارد می‌شوید، توکن API بسازید.", 403);
    }

    let parsed: ApiEnvelope<T>;
    try {
      parsed = JSON.parse(res.body) as ApiEnvelope<T>;
    } catch {
      if (retry && /<html/i.test(res.body) && !this.usesToken) {
        this.loggedIn = false;
        this.cookie = "";
        this.csrf = "";
        return this.request<T>(path, init, false);
      }
      throw new XuiError(`پاسخ نامعتبر از پنل (کد ${res.status}). مسیر API را بررسی کنید.`, res.status);
    }
    if (!parsed.success) throw new XuiError(parsed.msg || "درخواست از سوی پنل رد شد.", res.status);
    return parsed;
  }

  /** POST با JSON و در صورت خطا تلاش مجدد به‌صورت form-urlencoded (پنل‌های قدیمی) */
  private async postApi<T>(path: string, payload: Record<string, unknown>): Promise<ApiEnvelope<T>> {
    try {
      return await this.request<T>(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      if (!(err instanceof XuiError)) throw err;
      const form = new URLSearchParams();
      for (const [k, v] of Object.entries(payload)) form.set(k, String(v));
      return this.request<T>(path, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
    }
  }

  /**
   * تشخیص نسل API پنل. مسیر /panel/api/inbounds/options فقط در نسخه ۳ وجود دارد.
   * نتیجه تا پایان عمر این نمونه کش می‌شود.
   */
  async apiGeneration(): Promise<XuiApiGeneration> {
    if (this.generation) return this.generation;
    await this.ensureLogin();
    try {
      const res = await this.send("/panel/api/inbounds/options", { method: "GET" });
      const parsed = JSON.parse(res.body) as ApiEnvelope<unknown>;
      this.generation = parsed.success ? "v3" : "v2";
    } catch {
      this.generation = "v2";
    }
    return this.generation;
  }

  async listInbounds(): Promise<XuiInbound[]> {
    const res = await this.request<XuiInbound[]>("/panel/api/inbounds/list", { method: "GET" });
    return res.obj ?? [];
  }

  async getInbound(inboundId: number): Promise<XuiInbound> {
    const res = await this.request<XuiInbound>(`/panel/api/inbounds/get/${inboundId}`, { method: "GET" });
    if (!res.obj) throw new XuiError(`اینباند ${inboundId} در پنل پیدا نشد.`);
    return res.obj;
  }

  /** کلاینت‌های موجود روی یک اینباند (برای خواندن کلاینت الگو) */
  async listClients(inboundId: number): Promise<XuiRawClient[]> {
    return parseInboundClients(await this.getInbound(inboundId));
  }

  async addClient(inboundId: number, client: XuiClientSpec | XuiRawClient): Promise<void> {
    return this.addClientToInbounds([inboundId], client);
  }

  /**
   * افزودن یک کلاینت به چند اینباند.
   * در نسخه ۳ با یک درخواست (inboundIds) و در نسخه ۲ با تکرار درخواست قدیمی
   * انجام می‌شود — چون پنل نسخه ۲ برای هر اینباند یک رکورد جدا لازم دارد.
   */
  async addClientToInbounds(
    inboundIds: number[],
    client: XuiClientSpec | XuiRawClient,
  ): Promise<void> {
    if (!inboundIds.length) throw new XuiError("اینباندی برای ساخت کلاینت مشخص نشده است.");

    if ((await this.apiGeneration()) === "v3") {
      await this.request("/panel/api/clients/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client, inboundIds }),
      });
      return;
    }
    for (const inboundId of inboundIds) {
      await this.postApi("/panel/api/inbounds/addClient", {
        id: inboundId,
        settings: JSON.stringify({ clients: [client] }),
      });
    }
  }

  async updateClient(
    inboundId: number,
    clientId: string,
    client: XuiClientSpec | XuiRawClient,
  ): Promise<void> {
    if ((await this.apiGeneration()) === "v3") {
      const email = String(client.email ?? "");
      if (!email) throw new XuiError("برای به‌روزرسانی کلاینت در پنل نسخه ۳، نام (email) لازم است.");
      await this.request(`/panel/api/clients/update/${encodeURIComponent(email)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(client),
      });
      return;
    }
    await this.postApi(`/panel/api/inbounds/updateClient/${clientId}`, {
      id: inboundId,
      settings: JSON.stringify({ clients: [client] }),
    });
  }

  async deleteClient(inboundId: number, clientId: string, email?: string): Promise<void> {
    if ((await this.apiGeneration()) === "v3") {
      if (!email) throw new XuiError("برای حذف کلاینت در پنل نسخه ۳، نام (email) لازم است.");
      await this.request(`/panel/api/clients/del/${encodeURIComponent(email)}`, { method: "POST" });
      return;
    }
    await this.request(`/panel/api/inbounds/${inboundId}/delClient/${clientId}`, { method: "POST" });
  }

  async getClientTraffics(email: string): Promise<XuiClientStat | null> {
    const path =
      (await this.apiGeneration()) === "v3"
        ? `/panel/api/clients/traffic/${encodeURIComponent(email)}`
        : `/panel/api/inbounds/getClientTraffics/${encodeURIComponent(email)}`;
    try {
      const res = await this.request<XuiClientStat | null>(path, { method: "GET" });
      return res.obj ?? null;
    } catch (err) {
      if (err instanceof XuiError) return null;
      throw err;
    }
  }

  /**
   * لینک‌های اتصال آماده‌شده توسط خود پنل (فقط نسخه ۳).
   * دقیق‌ترین منبع است چون همان چیزی است که پنل به کاربر می‌دهد.
   */
  async getClientLinks(email: string): Promise<string[] | null> {
    if ((await this.apiGeneration()) !== "v3") return null;
    try {
      const res = await this.request<string[]>(
        `/panel/api/clients/links/${encodeURIComponent(email)}`,
        { method: "GET" },
      );
      return Array.isArray(res.obj) ? res.obj : null;
    } catch {
      return null;
    }
  }

  async resetClientTraffic(inboundId: number, email: string): Promise<void> {
    if ((await this.apiGeneration()) === "v3") {
      await this.request(`/panel/api/clients/resetTraffic/${encodeURIComponent(email)}`, {
        method: "POST",
      });
      return;
    }
    await this.request(
      `/panel/api/inbounds/${inboundId}/resetClientTraffic/${encodeURIComponent(email)}`,
      { method: "POST" },
    );
  }

  /** تست اتصال برای پنل ادمین */
  async testConnection(): Promise<{
    ok: boolean;
    message: string;
    inbounds: XuiInbound[];
    generation?: XuiApiGeneration;
    authMode?: "token" | "session";
  }> {
    try {
      await this.login();
      const generation = await this.apiGeneration();
      const inbounds = await this.listInbounds();
      return {
        ok: true,
        message:
          `اتصال موفق بود (API نسخه ${generation === "v3" ? "۳" : "۲"}، ` +
          `${this.authMode === "token" ? "با توکن API" : "با نام کاربری و رمز"})؛ ` +
          `${inbounds.length} اینباند یافت شد.`,
        inbounds,
        generation,
        authMode: this.authMode,
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message, inbounds: [], authMode: this.authMode };
    }
  }
}

export function xui(cfg: XuiPanelConfig): XuiClient {
  return new XuiClient(cfg);
}
