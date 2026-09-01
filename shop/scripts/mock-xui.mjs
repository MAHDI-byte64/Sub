/**
 * پنل 3x-ui شبیه‌سازی‌شده برای تست محلی (بدون نیاز به سرور واقعی).
 * دو اینباند دارد و روی هرکدام یک «کلاینت الگو» از پیش ساخته شده است.
 *
 * اجرا: node scripts/mock-xui.mjs [port]
 */
import http from "node:http";

const PORT = Number(process.argv[2] || 8899);
const USER = process.env.MOCK_USER || "admin";
const PASS = process.env.MOCK_PASS || "admin";
const SESSION = "mock-session-token";
const TEMPLATE_EMAIL = process.env.MOCK_TEMPLATE_EMAIL || "template-vip";
const ALT_TEMPLATE_EMAIL = process.env.MOCK_ALT_TEMPLATE_EMAIL || "template-alt";

const realityStream = JSON.stringify({
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
});

const wsStream = JSON.stringify({
  network: "ws",
  security: "tls",
  tlsSettings: { serverName: "alt.example.com", settings: { fingerprint: "chrome" } },
  wsSettings: { path: "/alt", headers: { Host: "alt.example.com" } },
});

/** id → { meta, clients: Map<email, {spec, up, down}> } */
const inbounds = new Map();

function addInbound(id, meta, templateSpec) {
  const clients = new Map();
  if (templateSpec) clients.set(templateSpec.email, { spec: templateSpec, up: 0, down: 0 });
  inbounds.set(id, { meta: { id, ...meta }, clients });
}

addInbound(
  1,
  {
    up: 0, down: 0, total: 0, remark: "vless-reality", enable: true, expiryTime: 0,
    listen: "", port: 443, protocol: "vless", streamSettings: realityStream,
    tag: "inbound-443", sniffing: "{}",
  },
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
  {
    up: 0, down: 0, total: 0, remark: "vless-ws-tls", enable: true, expiryTime: 0,
    listen: "", port: 8443, protocol: "vless", streamSettings: wsStream,
    tag: "inbound-8443", sniffing: "{}",
  },
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

function serialize(id) {
  const entry = inbounds.get(id);
  if (!entry) return null;
  const clients = [...entry.clients.values()];
  return {
    ...entry.meta,
    settings: JSON.stringify({ clients: clients.map((c) => c.spec), decryption: "none", fallbacks: [] }),
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
    if (found) return { inboundId: id, entry, found };
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

const authorized = (req) => (req.headers.cookie || "").includes(SESSION);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const raw = req.method === "POST" ? await readBody(req) : "";
  const payload = parsePayload(raw, req.headers["content-type"] || "");

  if (path === "/login" && req.method === "POST") {
    if (payload.username !== USER || payload.password !== PASS) {
      return json(res, { success: false, msg: "Invalid username or password" });
    }
    return json(res, { success: true, msg: "Login Successfully" }, 200, {
      "Set-Cookie": `3x-ui=${SESSION}; Path=/; HttpOnly`,
    });
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

  if (!authorized(req)) return json(res, { success: false, msg: "Login required" }, 401);

  if (path === "/panel/api/inbounds/list") {
    return json(res, { success: true, msg: "", obj: [...inbounds.keys()].map(serialize) });
  }

  const get = path.match(/^\/panel\/api\/inbounds\/get\/(\d+)$/);
  if (get) {
    const inbound = serialize(Number(get[1]));
    if (!inbound) return json(res, { success: false, msg: "Inbound not found", obj: null });
    return json(res, { success: true, msg: "", obj: inbound });
  }

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

  return json(res, { success: false, msg: `unknown path ${path}` }, 404);
});

server.listen(PORT, () => {
  console.log(
    `mock 3x-ui panel on http://127.0.0.1:${PORT} (user=${USER} pass=${PASS}, ` +
      `inbound#1 template=${TEMPLATE_EMAIL}, inbound#2 template=${ALT_TEMPLATE_EMAIL})`,
  );
});
