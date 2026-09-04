/**
 * میل‌سرور شبیه‌سازی‌شده برای تست.
 *
 * فقط همان چند دستوری را می‌فهمد که nodemailer برای فرستادن یک ایمیل ساده
 * می‌زند (EHLO، AUTH LOGIN، MAIL FROM، RCPT TO، DATA، QUIT) و هر پیام را در
 * حافظه نگه می‌دارد تا تست بتواند بخواندش:
 *
 *   GET http://127.0.0.1:<port+1>/_mail        → همهٔ ایمیل‌های دریافتی
 *   GET http://127.0.0.1:<port+1>/_mail/last   → آخرین ایمیل
 *   DELETE (یا GET) /_mail/clear               → پاک‌کردن صندوق
 *
 * اجرا: node scripts/mock-smtp.mjs [port]
 */
import net from "node:net";
import http from "node:http";

const PORT = Number(process.argv[2] || 8894);
const HTTP_PORT = PORT + 1;
const USER = process.env.MOCK_SMTP_USER || "shop";
const PASS = process.env.MOCK_SMTP_PASS || "smtp-pass";

/** ایمیل‌های دریافتی: {from, to, raw, subject, text, at} */
const inbox = [];

/** متن ایمیل را از بدنهٔ خام بیرون می‌کشد (کافی برای تست) */
function parseMessage(raw) {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const body = rest.join("\n\n");
  const headers = Object.fromEntries(
    head
      .split(/\r?\n/)
      .filter((line) => line.includes(":"))
      .map((line) => {
        const index = line.indexOf(":");
        return [line.slice(0, index).trim().toLowerCase(), line.slice(index + 1).trim()];
      }),
  );

  // موضوع ممکن است به‌صورت =?UTF-8?B?...?= کدگذاری شده باشد
  const subject = (headers.subject || "").replace(/=\?UTF-8\?B\?([^?]+)\?=/gi, (_, b64) =>
    Buffer.from(b64, "base64").toString("utf8"),
  );

  // بدنه معمولاً quoted-printable یا base64 است؛ هر دو را باز می‌کنیم
  let text = body;
  if (/quoted-printable/i.test(headers["content-transfer-encoding"] || "")) {
    text = body
      .replace(/=\r?\n/g, "")
      .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    text = Buffer.from(text, "binary").toString("utf8");
  } else if (/base64/i.test(headers["content-transfer-encoding"] || "")) {
    text = Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8");
  }

  // ایمیل چندبخشی: همهٔ بخش‌های base64/QP را کنار هم می‌گذاریم
  if (/multipart/i.test(headers["content-type"] || "")) {
    const parts = body.split(/--[-\w]+/).map((part) => {
      if (/base64/i.test(part)) {
        const payload = part.split(/\r?\n\r?\n/).slice(1).join("\n").replace(/\s/g, "");
        try {
          return Buffer.from(payload, "base64").toString("utf8");
        } catch {
          return "";
        }
      }
      if (/quoted-printable/i.test(part)) {
        const payload = part.split(/\r?\n\r?\n/).slice(1).join("\n");
        const decoded = payload
          .replace(/=\r?\n/g, "")
          .replace(/=([0-9A-F]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        return Buffer.from(decoded, "binary").toString("utf8");
      }
      return "";
    });
    text = parts.join("\n");
  }

  return { subject, text, headers };
}

const server = net.createServer((socket) => {
  let mode = "command";
  let raw = "";
  let buffer = "";
  const envelope = { from: "", to: [] };
  let expecting = null;

  const say = (line) => socket.write(`${line}\r\n`);
  say("220 mock-smtp ready");

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");

    let index;
    while ((index = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);

      if (mode === "data") {
        if (line === ".") {
          const parsed = parseMessage(raw);
          inbox.push({ ...envelope, raw, ...parsed, at: new Date().toISOString() });
          raw = "";
          mode = "command";
          say("250 OK queued");
        } else {
          raw += `${line.startsWith("..") ? line.slice(1) : line}\n`;
        }
        continue;
      }

      if (expecting === "user") {
        expecting = "pass";
        say("334 UGFzc3dvcmQ6");
        continue;
      }
      if (expecting === "pass") {
        expecting = null;
        const pass = Buffer.from(line, "base64").toString("utf8");
        say(pass === PASS ? "235 Authentication successful" : "535 Bad credentials");
        continue;
      }

      const [verb, ...args] = line.split(" ");
      const command = verb.toUpperCase();

      if (command === "EHLO" || command === "HELO") {
        say("250-mock-smtp");
        say("250-AUTH PLAIN LOGIN");
        say("250-8BITMIME");
        say("250 SMTPUTF8");
      } else if (command === "AUTH") {
        const kind = (args[0] || "").toUpperCase();
        if (kind === "LOGIN") {
          expecting = "user";
          say("334 VXNlcm5hbWU6");
        } else if (kind === "PLAIN") {
          const decoded = Buffer.from(args[1] || "", "base64").toString("utf8").split("\0");
          say(decoded[2] === PASS ? "235 Authentication successful" : "535 Bad credentials");
        } else {
          say("504 Unsupported auth");
        }
      } else if (command === "MAIL") {
        envelope.from = (line.match(/<([^>]*)>/) || [])[1] || "";
        say("250 OK");
      } else if (command === "RCPT") {
        const to = (line.match(/<([^>]*)>/) || [])[1] || "";
        if (to) envelope.to.push(to);
        say("250 OK");
      } else if (command === "DATA") {
        mode = "data";
        say("354 End data with <CR><LF>.<CR><LF>");
      } else if (command === "RSET") {
        envelope.from = "";
        envelope.to.length = 0;
        say("250 OK");
      } else if (command === "QUIT") {
        say("221 Bye");
        socket.end();
      } else {
        say("250 OK");
      }
    }
  });

  socket.on("error", () => socket.destroy());
});

server.listen(PORT, () => {
  console.log(`mock smtp on 127.0.0.1:${PORT} (user=${USER})`);
});

// صندوق ایمیل از طریق HTTP خوانده می‌شود تا تست مرورگر هم بتواند لینک را بردارد
http
  .createServer((req, res) => {
    const json = (body) => {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };

    if (req.url === "/_mail/clear") {
      inbox.length = 0;
      return json({ ok: true });
    }
    if (req.url === "/_mail/last") return json(inbox[inbox.length - 1] ?? null);
    return json(inbox);
  })
  .listen(HTTP_PORT, () => {
    console.log(`mock smtp inbox on http://127.0.0.1:${HTTP_PORT}/_mail`);
  });
