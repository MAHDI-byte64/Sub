import type { XuiInbound } from "./xui";

/** ساخت لینک کانفیگ از روی اطلاعات اینباند پنل (بدون نیاز به سرویس ساب) */

type Json = Record<string, any>;

function parseJson(value: string | undefined | null): Json {
  if (!value) return {};
  try {
    return JSON.parse(value) as Json;
  } catch {
    return {};
  }
}

export type BuiltLink = {
  label: string;
  uri: string;
};

function streamParams(stream: Json): URLSearchParams {
  const p = new URLSearchParams();
  const network: string = stream.network || "tcp";
  const security: string = stream.security || "none";
  p.set("type", network);
  p.set("security", security);

  if (network === "ws") {
    const ws = stream.wsSettings || {};
    if (ws.path) p.set("path", ws.path);
    const host = ws.host || ws.headers?.Host;
    if (host) p.set("host", host);
  } else if (network === "grpc") {
    const grpc = stream.grpcSettings || {};
    if (grpc.serviceName) p.set("serviceName", grpc.serviceName);
    if (grpc.multiMode) p.set("mode", "multi");
  } else if (network === "httpupgrade") {
    const hu = stream.httpupgradeSettings || {};
    if (hu.path) p.set("path", hu.path);
    if (hu.host) p.set("host", hu.host);
  } else if (network === "xhttp" || network === "splithttp") {
    const xh = stream.xhttpSettings || stream.splithttpSettings || {};
    if (xh.path) p.set("path", xh.path);
    if (xh.host) p.set("host", xh.host);
    if (xh.mode) p.set("mode", xh.mode);
  } else if (network === "tcp") {
    const tcp = stream.tcpSettings || {};
    const headerType = tcp.header?.type;
    if (headerType && headerType !== "none") {
      p.set("headerType", headerType);
      const req = tcp.header?.request || {};
      const path = Array.isArray(req.path) ? req.path[0] : req.path;
      if (path) p.set("path", path);
      const host = req.headers?.Host;
      if (host) p.set("host", Array.isArray(host) ? host[0] : host);
    }
  } else if (network === "kcp") {
    const kcp = stream.kcpSettings || {};
    if (kcp.seed) p.set("seed", kcp.seed);
    if (kcp.header?.type) p.set("headerType", kcp.header.type);
  }

  if (security === "tls") {
    const tls = stream.tlsSettings || {};
    if (tls.serverName) p.set("sni", tls.serverName);
    const fp = tls.settings?.fingerprint || tls.fingerprint;
    if (fp) p.set("fp", fp);
    if (Array.isArray(tls.alpn) && tls.alpn.length) p.set("alpn", tls.alpn.join(","));
    if (tls.settings?.allowInsecure) p.set("allowInsecure", "1");
  } else if (security === "reality") {
    const reality = stream.realitySettings || {};
    const sni = Array.isArray(reality.serverNames) ? reality.serverNames[0] : reality.serverName;
    if (sni) p.set("sni", sni);
    const pbk = reality.settings?.publicKey || reality.publicKey;
    if (pbk) p.set("pbk", pbk);
    const sid = Array.isArray(reality.shortIds) ? reality.shortIds[0] : reality.shortId;
    if (sid) p.set("sid", sid);
    const fp = reality.settings?.fingerprint || reality.fingerprint;
    if (fp) p.set("fp", fp);
    const spx = reality.settings?.spiderX || reality.spiderX;
    if (spx) p.set("spx", spx);
  }

  return p;
}

/**
 * ساخت لینک اتصال برای یک کلاینت داخل اینباند.
 * @param host دامنه/آی‌پی قابل استفاده برای اتصال
 */
export function buildClientLink(
  inbound: Pick<XuiInbound, "protocol" | "port" | "streamSettings" | "remark">,
  clientId: string,
  remark: string,
  host: string,
  flow = "",
): BuiltLink | null {
  const stream = parseJson(inbound.streamSettings);
  const params = streamParams(stream);
  const protocol = (inbound.protocol || "vless").toLowerCase();
  const tag = encodeURIComponent(remark);
  const address = host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;

  if (protocol === "vless") {
    if (flow) params.set("flow", flow);
    params.set("encryption", "none");
    return { label: "VLESS", uri: `vless://${clientId}@${address}:${inbound.port}?${params.toString()}#${tag}` };
  }

  if (protocol === "trojan") {
    return { label: "Trojan", uri: `trojan://${clientId}@${address}:${inbound.port}?${params.toString()}#${tag}` };
  }

  if (protocol === "vmess") {
    const config = {
      v: "2",
      ps: remark,
      add: host,
      port: String(inbound.port),
      id: clientId,
      aid: "0",
      scy: "auto",
      net: params.get("type") || "tcp",
      type: params.get("headerType") || "none",
      host: params.get("host") || "",
      path: params.get("path") || "",
      tls: params.get("security") === "none" ? "" : params.get("security") || "",
      sni: params.get("sni") || "",
      fp: params.get("fp") || "",
    };
    return {
      label: "VMess",
      uri: `vmess://${Buffer.from(JSON.stringify(config), "utf8").toString("base64")}`,
    };
  }

  return null;
}

/** آدرس لینک اشتراک (subscription) */
export function buildSubscriptionUrl(subBase: string | null | undefined, panelUrl: string, subId: string): string {
  if (subBase && subBase.trim()) {
    return `${subBase.trim().replace(/\/+$/, "")}/${subId}`;
  }
  try {
    const u = new URL(panelUrl);
    return `${u.protocol}//${u.hostname}:2096/sub/${subId}`;
  } catch {
    return `${panelUrl.replace(/\/+$/, "")}/sub/${subId}`;
  }
}

/** میزبان مناسب برای لینک کانفیگ: hostOverride یا listen اینباند یا هاست پنل */
export function resolveHost(hostOverride: string | null | undefined, inboundListen: string | undefined, panelUrl: string): string {
  if (hostOverride && hostOverride.trim()) return hostOverride.trim();
  if (inboundListen && inboundListen !== "0.0.0.0" && inboundListen !== "::") return inboundListen;
  try {
    return new URL(panelUrl).hostname;
  } catch {
    return panelUrl;
  }
}
