/**
 * درگاه پرداخت شبیه‌سازی‌شده برای تست.
 *
 * شکل پاسخ‌ها عمداً شبیه درگاه‌های ایرانی است تا درایور «دلخواه» (custom) با
 * همان تنظیماتی تست شود که یک درگاه واقعی لازم دارد:
 *
 *   POST /request  {api_key, amount, callback, order_id}  → {status:100, data:{token}}
 *   GET  /pay/{token}                                     → صفحهٔ پرداخت (شبیه‌سازی)
 *   POST /verify   {api_key, token, amount}               → {status:100, data:{ref_id}}
 *
 * اجرا: node scripts/mock-gateway.mjs [port]
 */
import http from "node:http";
import { randomBytes } from "node:crypto";

const PORT = Number(process.argv[2] || 8896);
const API_KEY = process.env.MOCK_GATEWAY_KEY || "gw-test-key";

/** token → { amount, orderId, callback, paid, verified } */
const payments = new Map();

function json(res, body, status = 200) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;
  const body = req.method === "POST" ? await readBody(req) : {};

  if (path === "/request" && req.method === "POST") {
    if (body.api_key !== API_KEY) return json(res, { status: 401, message: "کلید نامعتبر" });
    const amount = Number(body.amount || 0);
    if (!amount) return json(res, { status: 400, message: "مبلغ نامعتبر" });

    const token = randomBytes(8).toString("hex");
    payments.set(token, {
      amount,
      orderId: String(body.order_id || ""),
      callback: String(body.callback || ""),
      paid: false,
      verified: false,
    });
    return json(res, { status: 100, data: { token } });
  }

  // صفحهٔ پرداخت: با ?fail=1 پرداخت ناموفق شبیه‌سازی می‌شود
  const pay = path.match(/^\/pay\/([a-z0-9]+)$/i);
  if (pay) {
    const token = pay[1];
    const record = payments.get(token);
    if (!record) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("تراکنش پیدا نشد");
    }
    const failed = url.searchParams.get("fail") === "1";
    record.paid = !failed;
    const back = new URL(record.callback);
    back.searchParams.set("token", token);
    back.searchParams.set("status", failed ? "0" : "1");
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }

  if (path === "/verify" && req.method === "POST") {
    if (body.api_key !== API_KEY) return json(res, { status: 401, message: "کلید نامعتبر" });
    const record = payments.get(String(body.token || ""));
    if (!record) return json(res, { status: 404, message: "تراکنش پیدا نشد" });
    if (!record.paid) return json(res, { status: 402, message: "پرداخت انجام نشده است" });
    if (Number(body.amount) !== record.amount) {
      return json(res, { status: 403, message: "مبلغ با تراکنش نمی‌خواند" });
    }
    // تأیید دوباره هم باید موفق باشد (درگاه‌های واقعی هم همین‌طورند)
    record.verified = true;
    return json(res, { status: 100, data: { ref_id: `BANK-${record.orderId}` } });
  }

  if (path === "/_mock/state") {
    return json(res, { payments: Object.fromEntries(payments) });
  }

  return json(res, { status: 404, message: `unknown path ${path}` }, 404);
});

server.listen(PORT, () => {
  console.log(`mock gateway on http://127.0.0.1:${PORT} — key=${API_KEY}`);
});
