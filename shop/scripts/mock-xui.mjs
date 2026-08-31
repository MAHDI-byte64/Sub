/**
 * پنل 3x-ui شبیه‌سازی‌شده برای تست محلی (بدون نیاز به سرور واقعی).
 * اجرا: node scripts/mock-xui.mjs [port]
 */
import http from "node:http";

const PORT = Number(process.argv[2] || 8899);
const USER = process.env.MOCK_USER || "admin";
const PASS = process.env.MOCK_PASS || "admin";
const SESSION = "mock-session-token";

const inbound = {
  id: 1,
  up: 0,
  down: 0,
  total: 0,
  remark: "vless-reality",
  enable: true,
  expiryTime: 0,
  listen: "",
  port: 443,
  protocol: "vless",
  settings: JSON.stringify({ clients: [], decryption: "none", fallbacks: [] }),
  streamSettings: JSON.stringify({
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
  }),
  tag: "inbound-443",
  sniffing: "{}",
  clientStats: [],
};

/** clients ذخیره‌شده: email → رکورد */
const clients = new Map();

function json(res, payload, status = 200, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "Content-Type": "application/json", ...headers });
  res.end(body);
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
  return (req.headers.cookie || "").includes(SESSION);
}

function syncInbound() {
  inbound.settings = JSON.stringify({
    clients: [...clients.values()].map((c) => c.spec),
    decryption: "none",
    fallbacks: [],
  });
  inbound.clientStats = [...clients.values()].map((c, i) => ({
    id: i + 1,
    inboundId: 1,
    enable: c.spec.enable,
    email: c.spec.email,
    up: c.up,
    down: c.down,
    expiryTime: c.spec.expiryTime,
    total: c.spec.totalGB,
  }));
}

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
    const email = url.searchParams.get("email");
    const found = clients.get(email);
    if (found) {
      found.up = Number(url.searchParams.get("up") || 0);
      found.down = Number(url.searchParams.get("down") || 0);
    }
    return json(res, { success: true, obj: found?.spec ?? null });
  }

  if (!authorized(req)) return json(res, { success: false, msg: "Login required" }, 401);

  if (path === "/panel/api/inbounds/list") {
    syncInbound();
    return json(res, { success: true, msg: "", obj: [inbound] });
  }

  if (path.startsWith("/panel/api/inbounds/get/")) {
    syncInbound();
    return json(res, { success: true, msg: "", obj: inbound });
  }

  if (path === "/panel/api/inbounds/addClient" && req.method === "POST") {
    const settings = JSON.parse(payload.settings || "{}");
    for (const spec of settings.clients || []) {
      if (clients.has(spec.email)) {
        return json(res, { success: false, msg: "Duplicate email" });
      }
      clients.set(spec.email, { spec, up: 0, down: 0 });
    }
    syncInbound();
    return json(res, { success: true, msg: "Client added", obj: null });
  }

  const update = path.match(/^\/panel\/api\/inbounds\/updateClient\/(.+)$/);
  if (update && req.method === "POST") {
    const settings = JSON.parse(payload.settings || "{}");
    const spec = (settings.clients || [])[0];
    if (!spec) return json(res, { success: false, msg: "No client" });
    const existing = [...clients.values()].find((c) => c.spec.id === update[1] || c.spec.email === spec.email);
    if (!existing) return json(res, { success: false, msg: "Client not found" });
    clients.set(spec.email, { spec, up: existing.up, down: existing.down });
    syncInbound();
    return json(res, { success: true, msg: "Client updated", obj: null });
  }

  const traffics = path.match(/^\/panel\/api\/inbounds\/getClientTraffics\/(.+)$/);
  if (traffics) {
    const email = decodeURIComponent(traffics[1]);
    const found = clients.get(email);
    if (!found) return json(res, { success: false, msg: "Client not found", obj: null });
    return json(res, {
      success: true,
      msg: "",
      obj: {
        id: 1,
        inboundId: 1,
        enable: found.spec.enable,
        email,
        up: found.up,
        down: found.down,
        expiryTime: found.spec.expiryTime,
        total: found.spec.totalGB,
      },
    });
  }

  const del = path.match(/^\/panel\/api\/inbounds\/(\d+)\/delClient\/(.+)$/);
  if (del && req.method === "POST") {
    const target = [...clients.entries()].find(([, c]) => c.spec.id === del[2]);
    if (target) clients.delete(target[0]);
    syncInbound();
    return json(res, { success: true, msg: "Client deleted", obj: null });
  }

  const reset = path.match(/^\/panel\/api\/inbounds\/(\d+)\/resetClientTraffic\/(.+)$/);
  if (reset && req.method === "POST") {
    const email = decodeURIComponent(reset[2]);
    const found = clients.get(email);
    if (found) {
      found.up = 0;
      found.down = 0;
    }
    syncInbound();
    return json(res, { success: true, msg: "Traffic reset", obj: null });
  }

  return json(res, { success: false, msg: `unknown path ${path}` }, 404);
});

server.listen(PORT, () => {
  console.log(`mock 3x-ui panel listening on http://127.0.0.1:${PORT} (user=${USER} pass=${PASS})`);
});
