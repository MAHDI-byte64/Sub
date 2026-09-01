import "server-only";
import http from "node:http";
import https from "node:https";

/**
 * کلاینت API پنل 3x-ui (پنل سنایی)
 * مسیرها بر اساس نسخه‌های 2.x و 3.x پنل:
 *   POST {base}/login
 *   GET  {base}/panel/api/inbounds/list
 *   GET  {base}/panel/api/inbounds/get/{id}
 *   POST {base}/panel/api/inbounds/addClient
 *   POST {base}/panel/api/inbounds/updateClient/{uuid}
 *   POST {base}/panel/api/inbounds/{inboundId}/delClient/{uuid}
 *   GET  {base}/panel/api/inbounds/getClientTraffics/{email}
 *   POST {base}/panel/api/inbounds/{inboundId}/resetClientTraffic/{email}
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

export type XuiPanelConfig = {
  url: string;
  username: string;
  password: string;
  /** پذیرش گواهی self-signed (پیش‌فرض: بله، چون اغلب پنل‌ها گواهی خودامضا دارند) */
  insecure?: boolean;
  timeoutMs?: number;
};

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
  settings: string;
  streamSettings: string;
  tag: string;
  sniffing: string;
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

/** استخراج کلاینت‌های یک اینباند از فیلد settings */
export function parseInboundClients(inbound: Pick<XuiInbound, "settings">): XuiRawClient[] {
  try {
    const settings = JSON.parse(inbound.settings || "{}") as { clients?: XuiRawClient[] };
    return Array.isArray(settings.clients) ? settings.clients : [];
  } catch {
    return [];
  }
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
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "XuiError";
  }
}

type ApiEnvelope<T> = { success: boolean; msg?: string; obj?: T };

type ReqInit = { method?: string; headers?: Record<string, string>; body?: string };

export class XuiClient {
  private cookie = "";
  private loggedIn = false;

  constructor(private readonly cfg: XuiPanelConfig) {}

  /** آدرس پایه بدون اسلش انتهایی */
  get base(): string {
    return this.cfg.url.trim().replace(/\/+$/, "");
  }

  private get timeout(): number {
    return this.cfg.timeoutMs ?? 20_000;
  }

  private headersFor(extra?: Record<string, string>): Record<string, string> {
    return {
      Accept: "application/json, text/plain, */*",
      ...(this.cookie ? { Cookie: this.cookie } : {}),
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

  /** ورود به پنل و گرفتن کوکی نشست */
  async login(): Promise<void> {
    const body = new URLSearchParams({
      username: this.cfg.username,
      password: this.cfg.password,
    }).toString();

    let res: RawResponse;
    try {
      res = await this.send("/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
    } catch (err) {
      throw new XuiError(`اتصال به پنل برقرار نشد: ${(err as Error).message}`);
    }
    this.captureCookies(res);

    if (res.status >= 400) {
      throw new XuiError(`ورود به پنل ناموفق بود (کد ${res.status}). آدرس پنل را بررسی کنید.`, res.status);
    }

    let parsed: ApiEnvelope<unknown> | null = null;
    try {
      parsed = JSON.parse(res.body) as ApiEnvelope<unknown>;
    } catch {
      /* بعضی نسخه‌ها به‌جای JSON صفحه HTML برمی‌گردانند */
    }
    if (parsed && parsed.success === false) {
      throw new XuiError(parsed.msg || "نام کاربری یا رمز عبور پنل اشتباه است.");
    }
    if (!this.cookie) {
      throw new XuiError("پنل کوکی نشست برنگرداند؛ نام کاربری/رمز یا مسیر پنل (base path) را بررسی کنید.");
    }
    this.loggedIn = true;
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

    // نشست منقضی شده → یک بار دوباره لاگین می‌کنیم
    if ((res.status === 401 || res.status === 302 || res.status === 307) && retry) {
      this.loggedIn = false;
      this.cookie = "";
      return this.request<T>(path, init, false);
    }

    let parsed: ApiEnvelope<T>;
    try {
      parsed = JSON.parse(res.body) as ApiEnvelope<T>;
    } catch {
      if (retry && /<html/i.test(res.body)) {
        this.loggedIn = false;
        this.cookie = "";
        return this.request<T>(path, init, false);
      }
      throw new XuiError(`پاسخ نامعتبر از پنل (کد ${res.status}). مسیر API را بررسی کنید.`, res.status);
    }
    if (!parsed.success) throw new XuiError(parsed.msg || "درخواست از سوی پنل رد شد.");
    return parsed;
  }

  /** POST با JSON و در صورت خطا تلاش مجدد به‌صورت form-urlencoded */
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
    await this.postApi("/panel/api/inbounds/addClient", {
      id: inboundId,
      settings: JSON.stringify({ clients: [client] }),
    });
  }

  async updateClient(inboundId: number, clientId: string, client: XuiClientSpec | XuiRawClient): Promise<void> {
    await this.postApi(`/panel/api/inbounds/updateClient/${clientId}`, {
      id: inboundId,
      settings: JSON.stringify({ clients: [client] }),
    });
  }

  async deleteClient(inboundId: number, clientId: string): Promise<void> {
    await this.request(`/panel/api/inbounds/${inboundId}/delClient/${clientId}`, { method: "POST" });
  }

  async getClientTraffics(email: string): Promise<XuiClientStat | null> {
    try {
      const res = await this.request<XuiClientStat | null>(
        `/panel/api/inbounds/getClientTraffics/${encodeURIComponent(email)}`,
        { method: "GET" },
      );
      return res.obj ?? null;
    } catch (err) {
      if (err instanceof XuiError) return null;
      throw err;
    }
  }

  async resetClientTraffic(inboundId: number, email: string): Promise<void> {
    await this.request(
      `/panel/api/inbounds/${inboundId}/resetClientTraffic/${encodeURIComponent(email)}`,
      { method: "POST" },
    );
  }

  /** تست اتصال برای پنل ادمین */
  async testConnection(): Promise<{ ok: boolean; message: string; inbounds: XuiInbound[] }> {
    try {
      await this.login();
      const inbounds = await this.listInbounds();
      return {
        ok: true,
        message: `اتصال موفق بود؛ ${inbounds.length} اینباند یافت شد.`,
        inbounds,
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message, inbounds: [] };
    }
  }
}

export function xui(cfg: XuiPanelConfig): XuiClient {
  return new XuiClient(cfg);
}
