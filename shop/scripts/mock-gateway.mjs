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
import { createHmac, randomBytes } from "node:crypto";

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
  const pay = path.match(/^\/pay\/([a-z0-9_]+)$/i);
  if (pay) {
    const token = pay[1];
    const record = payments.get(token);
    if (!record) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("تراکنش پیدا نشد");
    }
    const failed = url.searchParams.get("fail") === "1";
    record.paid = !failed;
    const backTo = record.returnUrl || record.callback;
    if (!backTo) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(failed ? "پرداخت ناموفق" : "پرداخت انجام شد");
    }
    const back = new URL(backTo);
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

  /* ------------------------- شبیه‌سازی API هوش‌پی ------------------------- */

  if (path === "/api/v1/invoices" && req.method === "POST") {
    if (req.headers["x-api-key"] !== API_KEY) {
      return json(res, { success: false, message: "کلید نامعتبر" }, 401);
    }
    const amount = Number(body.amount || 0);
    if (!amount || amount < 1000) return json(res, { success: false, message: "مبلغ نامعتبر" }, 400);

    const uid = `inv_${randomBytes(6).toString("hex")}`;
    // هوش‌پی مبلغ یکتا می‌سازد و کارمزد را بر اساس fee_mode جابه‌جا می‌کند
    const fee = Math.round(amount * 0.2);
    const payable =
      body.fee_mode === "buyer" ? amount + fee + 17 : body.fee_mode === "split" ? amount + Math.round(fee / 2) + 17 : amount + 17;
    payments.set(uid, {
      amount,
      payable,
      orderId: String(body.order_id || ""),
      callback: String(body.callback_url || ""),
      // هوش‌پی کاربر را به return_url برمی‌گرداند و وب‌هوک را به callback_url می‌زند
      returnUrl: String(body.return_url || ""),
      feeMode: String(body.fee_mode || "seller"),
      paid: false,
      verified: false,
    });
    return json(res, {
      success: true,
      data: {
        uid,
        amount,
        fee_mode: body.fee_mode ?? "seller",
        fee_amount: fee,
        payable_amount: payable,
        status: "pending",
        payment_url: `http://127.0.0.1:${PORT}/pay/${uid}`,
        card: { card_number: "6037...", holder_name: "تست", bank_name: "ملت" },
      },
    });
  }

  const hpVerify = path.match(/^\/api\/v1\/invoices\/([a-z0-9_]+)\/verify$/i);
  if (hpVerify && req.method === "POST") {
    if (req.headers["x-api-key"] !== API_KEY) {
      return json(res, { success: false, message: "کلید نامعتبر" }, 401);
    }
    const record = payments.get(hpVerify[1]);
    if (!record) return json(res, { success: false, message: "فاکتور یافت نشد" }, 404);
    if (!record.paid) {
      return json(res, { success: true, paid: false, status: "pending", data: { uid: hpVerify[1] } });
    }
    record.verified = true;
    return json(res, {
      success: true,
      paid: true,
      status: "paid",
      data: { uid: hpVerify[1], tracking_code: `HP-${record.orderId}` },
    });
  }

  const hpGet = path.match(/^\/api\/v1\/invoices\/([a-z0-9_]+)$/i);
  if (hpGet && req.method === "GET") {
    const record = payments.get(hpGet[1]);
    if (!record) return json(res, { success: false, message: "فاکتور یافت نشد" }, 404);
    return json(res, {
      success: true,
      data: { uid: hpGet[1], status: record.paid ? "paid" : "pending", amount: record.amount },
    });
  }

  // ارسال وب‌هوک امضاشده به سایت (شبیه‌سازی رفتار واقعی هوش‌پی)
  const hpHook = path.match(/^\/_mock\/hooshpay-webhook\/([a-z0-9_]+)$/i);
  if (hpHook) {
    const uid = hpHook[1];
    const record = payments.get(uid);
    if (!record) return json(res, { ok: false, message: "not found" }, 404);
    record.paid = true;

    const payload = {
      event: "payment.success",
      invoice: uid,
      order_id: record.orderId,
      status: "paid",
      amount: record.amount,
      payable_amount: record.payable,
      tracking_code: `HP-${record.orderId}`,
    };
    const sorted = Object.keys(payload)
      .sort()
      .reduce((acc, key) => ({ ...acc, [key]: payload[key] }), {});
    const signature = createHmac("sha256", url.searchParams.get("secret") || "")
      .update(JSON.stringify(sorted))
      .digest("hex");

    const target = url.searchParams.get("url") || record.callback;
    let status = 0;
    let text = "";
    try {
      const hookRes = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-HooshPay-Signature": signature },
        body: JSON.stringify(payload),
      });
      status = hookRes.status;
      text = await hookRes.text();
    } catch (err) {
      text = String(err);
    }
    return json(res, { ok: true, sent: target, status, response: text.slice(0, 200), signature });
  }

  if (path === "/_mock/state") {
    return json(res, { payments: Object.fromEntries(payments) });
  }

  return json(res, { status: 404, message: `unknown path ${path}` }, 404);
});

server.listen(PORT, () => {
  console.log(`mock gateway on http://127.0.0.1:${PORT} — key=${API_KEY}`);
});
