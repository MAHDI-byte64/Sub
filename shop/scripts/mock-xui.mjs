/**
 * پنل 3x-ui شبیه‌سازی‌شده برای تست محلی (بدون نیاز به سرور واقعی).
 *
 * دو حالت دارد:
 *   MOCK_GEN=v2 → مسیرهای قدیمی (/panel/api/inbounds/addClient و ...)، settings به‌صورت رشته JSON
 *   MOCK_GEN=v3 → API رسمی نسخه ۳ (/panel/api/clients/*)، احراز هویت با توکن Bearer،
 *                 settings به‌صورت آبجکت، و مسیر /panel/api/inbounds/options برای تشخیص نسل
 *
 * اجرا: node scripts/mock-xui.mjs [port] [v2|v3]
 */
import http from "node:http";

const PORT = Number(process.argv[2] || 8899);
const GEN = (process.argv[3] || process.env.MOCK_GEN || "v2").toLowerCase() === "v3" ? "v3" : "v2";
const USER = process.env.MOCK_USER || "admin";
const PASS = process.env.MOCK_PASS || "admin";
const API_TOKEN = process.env.MOCK_API_TOKEN || "3xui-test-token";
const SESSION = "mock-session-token";
const CSRF = "mock-csrf-token";
const TEMPLATE_EMAIL = process.env.MOCK_TEMPLATE_EMAIL || "template-vip";
const ALT_TEMPLATE_EMAIL = process.env.MOCK_ALT_TEMPLATE_EMAIL || "template-alt";

const realityStream = {
  network: "tcp",
  security: "reality",
  realitySettings: {
    show: false,
    dest: "www.datadoghq.com:443",
    serverNames: ["www.datadoghq.com"],
    privateKey: "PRIVATE",
    shortIds: ["a1b2c3"],
    settings: { publicKey: "PUBLICKEY123", fingerprint: "chrome", spiderX: "/" },
  },
  tcpSettings: { header: { type: "none" } },
};

const wsStream = {
  network: "ws",
  security: "tls",
  tlsSettings: { serverName: "alt.example.com", settings: { fingerprint: "chrome" } },
  wsSettings: { path: "/alt", headers: { Host: "alt.example.com" } },
};

/** id → { meta, stream, clients: Map<email, {spec, up, down}> } */
const inbounds = new Map();

function addInbound(id, meta, stream, templateSpec) {
  const clients = new Map();
  if (templateSpec) clients.set(templateSpec.email, { spec: templateSpec, up: 0, down: 0 });
  inbounds.set(id, { meta: { id, ...meta }, stream, clients });
}

addInbound(
  1,
  { up: 0, down: 0, total: 0, remark: "vless-reality", enable: true, expiryTime: 0,
    listen: "", port: 443, protocol: "vless", tag: "inbound-443" },
  realityStream,
  {
    id: "11111111-2222-3333-4444-555555555555",
    email: TEMPLATE_EMAIL,
    flow: "xtls-rprx-vision",
    limitIp: 3,
    totalGB: 0,
    expiryTime: 0,
    enable: true,
    tgId: "999888777",
    subId: "templatesub",
    reset: 0,
    comment: "vip-template",
  },
);

addInbound(
  2,
  { up: 0, down: 0, total: 0, remark: "vless-ws-tls", enable: true, expiryTime: 0,
    listen: "", port: 8443, protocol: "vless", tag: "inbound-8443" },
  wsStream,
  {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    email: ALT_TEMPLATE_EMAIL,
    flow: "",
    limitIp: 5,
    totalGB: 0,
    expiryTime: 0,
    enable: true,
    tgId: "",
    subId: "alttemplatesub",
    reset: 0,
    comment: "alt-template",
  },
);

/** در نسخه ۲ فیلدهای JSON رشته‌اند و در نسخه ۳ آبجکت */
function encodeJsonField(value) {
  return GEN === "v3" ? value : JSON.stringify(value);
}

function serialize(id) {
  const entry = inbounds.get(id);
  if (!entry) return null;
  const clients = [...entry.clients.values()];
  return {
    ...entry.meta,
    settings: encodeJsonField({ clients: clients.map((c) => c.spec), decryption: "none", fallbacks: [] }),
    streamSettings: encodeJsonField(entry.stream),
    sniffing: encodeJsonField({ enabled: false }),
    clientStats: clients.map((c, i) => ({
      id: i + 1,
      inboundId: id,
      enable: c.spec.enable,
      email: c.spec.email,
      up: c.up,
      down: c.down,
      expiryTime: c.spec.expiryTime,
      total: c.spec.totalGB,
    })),
  };
}

function findClient(email) {
  for (const [id, entry] of inbounds) {
    const found = entry.clients.get(email);
    if (found) return { inboundId: id, entry, found, email };
  }
  return null;
}

function findClientById(clientId) {
  for (const [id, entry] of inbounds) {
    for (const [email, record] of entry.clients) {
      if (record.spec.id === clientId) return { inboundId: id, entry, email, record };
    }
  }
  return null;
}

/** لینک اتصالی که خود پنل تولید می‌کند (نسخه ۳) */
function clientLinks(email) {
  const hit = findClient(email);
  if (!hit) return [];
  const port = hit.entry.meta.port;
  return [`vless://${hit.found.spec.id}@panel.example.com:${port}?type=tcp&security=reality#${email}`];
}

function json(res, payload, status = 200, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function parsePayload(raw, contentType = "") {
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

function authorized(req) {
  if (GEN === "v3") {
    const auth = req.headers.authorization || "";
    if (auth === `Bearer ${API_TOKEN}`) return { ok: true, viaToken: true };
  }
  if ((req.headers.cookie || "").includes(SESSION)) return { ok: true, viaToken: false };
  return { ok: false, viaToken: false };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const raw = req.method === "POST" ? await readBody(req) : "";
  const payload = parsePayload(raw, req.headers["content-type"] || "");

  if (path === "/login" && req.method === "POST") {
    // نسخه ۳ بدنه JSON می‌گیرد و نسخه ۲ فرم
    if (payload.username !== USER || payload.password !== PASS) {
      return json(res, { success: false, msg: "Invalid username or password" });
    }
    return json(res, { success: true, msg: "Login Successfully" }, 200, {
      "Set-Cookie": `3x-ui=${SESSION}; Path=/; HttpOnly`,
    });
  }

  if (path === "/csrf-token") {
    if (GEN !== "v3") return json(res, { success: false, msg: "not found" }, 404);
    return json(res, { success: true, obj: CSRF });
  }

  // برای تست مصرف: /_mock/usage?email=..&up=..&down=..
  if (path === "/_mock/usage") {
    const hit = findClient(url.searchParams.get("email"));
    if (hit) {
      hit.found.up = Number(url.searchParams.get("up") || 0);
      hit.found.down = Number(url.searchParams.get("down") || 0);
    }
    return json(res, { success: true, obj: hit?.found.spec ?? null });
  }

  const auth = authorized(req);
  if (!auth.ok) return json(res, { success: false, msg: "Login required" }, 401);

  // در حالت کوکی، پنل نسخه ۳ برای درخواست‌های ناامن هدر CSRF می‌خواهد
  if (GEN === "v3" && req.method === "POST" && !auth.viaToken && path.startsWith("/panel/api/")) {
    if (req.headers["x-csrf-token"] !== CSRF) {
      return json(res, { success: false, msg: "CSRF token missing" }, 403);
    }
  }

  /* ------------------------------ اینباندها ------------------------------ */

  if (path === "/panel/api/inbounds/options") {
    if (GEN !== "v3") return json(res, { success: false, msg: "unknown path" }, 404);
    return json(res, {
      success: true,
      obj: [...inbounds.values()].map((e) => ({
        id: e.meta.id,
        remark: e.meta.remark,
        protocol: e.meta.protocol,
        port: e.meta.port,
        tag: e.meta.tag,
        enable: e.meta.enable,
      })),
    });
  }

  if (path === "/panel/api/inbounds/list") {
    return json(res, { success: true, msg: "", obj: [...inbounds.keys()].map(serialize) });
  }

  const get = path.match(/^\/panel\/api\/inbounds\/get\/(\d+)$/);
  if (get) {
    const inbound = serialize(Number(get[1]));
    if (!inbound) return json(res, { success: false, msg: "Inbound not found", obj: null });
    return json(res, { success: true, msg: "", obj: inbound });
  }

  /* -------------------------- کلاینت‌ها: نسخه ۳ -------------------------- */

  if (GEN === "v3") {
    if (path === "/panel/api/clients/add" && req.method === "POST") {
      const { client, inboundIds } = payload;
      if (!client || !Array.isArray(inboundIds) || !inboundIds.length) {
        return json(res, { success: false, msg: "client and inboundIds are required" });
      }
      if (findClient(client.email)) return json(res, { success: false, msg: "Duplicate email" });
      for (const id of inboundIds) {
        const entry = inbounds.get(Number(id));
        if (!entry) return json(res, { success: false, msg: `Inbound ${id} not found` });
        entry.clients.set(client.email, { spec: client, up: 0, down: 0 });
      }
      return json(res, { success: true, msg: "Client added" });
    }

    const v3update = path.match(/^\/panel\/api\/clients\/update\/(.+)$/);
    if (v3update && req.method === "POST") {
      const email = decodeURIComponent(v3update[1]);
      const hit = findClient(email);
      if (!hit) return json(res, { success: false, msg: "Client not found" });
      hit.entry.clients.set(email, { spec: payload, up: hit.found.up, down: hit.found.down });
      return json(res, { success: true, msg: "Client updated" });
    }

    const v3del = path.match(/^\/panel\/api\/clients\/del\/(.+)$/);
    if (v3del && req.method === "POST") {
      const email = decodeURIComponent(v3del[1]);
      const hit = findClient(email);
      if (hit) hit.entry.clients.delete(email);
      return json(res, { success: true, msg: "Client deleted" });
    }

    const v3traffic = path.match(/^\/panel\/api\/clients\/traffic\/(.+)$/);
    if (v3traffic) {
      const email = decodeURIComponent(v3traffic[1]);
      const hit = findClient(email);
      if (!hit) return json(res, { success: false, msg: "Client not found", obj: null });
      return json(res, {
        success: true,
        obj: {
          id: 1,
          inboundId: hit.inboundId,
          enable: hit.found.spec.enable,
          email,
          up: hit.found.up,
          down: hit.found.down,
          expiryTime: hit.found.spec.expiryTime,
          total: hit.found.spec.totalGB,
          subId: hit.found.spec.subId,
          uuid: hit.found.spec.id,
        },
      });
    }

    const v3links = path.match(/^\/panel\/api\/clients\/links\/(.+)$/);
    if (v3links) {
      return json(res, { success: true, obj: clientLinks(decodeURIComponent(v3links[1])) });
    }

    const v3reset = path.match(/^\/panel\/api\/clients\/resetTraffic\/(.+)$/);
    if (v3reset && req.method === "POST") {
      const hit = findClient(decodeURIComponent(v3reset[1]));
      if (hit) {
        hit.found.up = 0;
        hit.found.down = 0;
      }
      return json(res, { success: true, msg: "Traffic reset" });
    }

    // مسیرهای قدیمی در نسخه ۳ وجود ندارند
    if (/^\/panel\/api\/inbounds\/(addClient|updateClient|\d+\/delClient|getClientTraffics)/.test(path)) {
      return json(res, { success: false, msg: "unknown path (v3 panel)" }, 404);
    }
  }

  /* -------------------------- کلاینت‌ها: نسخه ۲ -------------------------- */

  if (GEN === "v2") {
    if (path === "/panel/api/inbounds/addClient" && req.method === "POST") {
      const entry = inbounds.get(Number(payload.id));
      if (!entry) return json(res, { success: false, msg: "Inbound not found" });
      const settings = JSON.parse(payload.settings || "{}");
      for (const spec of settings.clients || []) {
        if (findClient(spec.email)) return json(res, { success: false, msg: "Duplicate email" });
        entry.clients.set(spec.email, { spec, up: 0, down: 0 });
      }
      return json(res, { success: true, msg: "Client added", obj: null });
    }

    const update = path.match(/^\/panel\/api\/inbounds\/updateClient\/(.+)$/);
    if (update && req.method === "POST") {
      const settings = JSON.parse(payload.settings || "{}");
      const spec = (settings.clients || [])[0];
      if (!spec) return json(res, { success: false, msg: "No client" });
      let existing = findClientById(update[1]);
      if (!existing) {
        const hit = findClient(spec.email);
        if (hit) existing = { inboundId: hit.inboundId, entry: hit.entry, email: spec.email, record: hit.found };
      }
      if (!existing) return json(res, { success: false, msg: "Client not found" });
      existing.entry.clients.delete(existing.email);
      existing.entry.clients.set(spec.email, { spec, up: existing.record.up, down: existing.record.down });
      return json(res, { success: true, msg: "Client updated", obj: null });
    }

    const traffics = path.match(/^\/panel\/api\/inbounds\/getClientTraffics\/(.+)$/);
    if (traffics) {
      const email = decodeURIComponent(traffics[1]);
      const hit = findClient(email);
      if (!hit) return json(res, { success: false, msg: "Client not found", obj: null });
      return json(res, {
        success: true,
        msg: "",
        obj: {
          id: 1,
          inboundId: hit.inboundId,
          enable: hit.found.spec.enable,
          email,
          up: hit.found.up,
          down: hit.found.down,
          expiryTime: hit.found.spec.expiryTime,
          total: hit.found.spec.totalGB,
        },
      });
    }

    const del = path.match(/^\/panel\/api\/inbounds\/(\d+)\/delClient\/(.+)$/);
    if (del && req.method === "POST") {
      const hit = findClientById(del[2]);
      if (hit) hit.entry.clients.delete(hit.email);
      return json(res, { success: true, msg: "Client deleted", obj: null });
    }

    const reset = path.match(/^\/panel\/api\/inbounds\/(\d+)\/resetClientTraffic\/(.+)$/);
    if (reset && req.method === "POST") {
      const hit = findClient(decodeURIComponent(reset[2]));
      if (hit) {
        hit.found.up = 0;
        hit.found.down = 0;
      }
      return json(res, { success: true, msg: "Traffic reset", obj: null });
    }
  }

  return json(res, { success: false, msg: `unknown path ${path}` }, 404);
});

server.listen(PORT, () => {
  console.log(
    `mock 3x-ui (${GEN}) on http://127.0.0.1:${PORT} — user=${USER} pass=${PASS}` +
      (GEN === "v3" ? `, token=${API_TOKEN}` : "") +
      `, inbound#1 template=${TEMPLATE_EMAIL}, inbound#2 template=${ALT_TEMPLATE_EMAIL}`,
  );
});
