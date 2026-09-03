import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "./db";
import { uploadDir } from "./uploads";
import { asBool, asNum, getSettings, saveSettings } from "./settings";

/**
 * Full backup: the SQLite database file + the payment receipts + a manifest,
 * packed into a single `tar.gz`.
 *
 * The archive is built with Node itself (tar is a simple format and zlib ships
 * with Node), so there is no extra dependency and no need for a `tar` binary on
 * the server.
 *
 * NOTE - keep this file ASCII only. Turbopack reports an internal diagnostic
 * for modules that call `fs` with computed paths, and its code-frame
 * highlighter panics when the highlighted line holds non-ASCII text, which
 * breaks `next build`. The Persian wording of this feature lives in the server
 * actions and in the admin page, where it belongs anyway.
 */

export const BACKUP_PREFIX = "fandogh-backup-";

export type BackupFile = {
  name: string;
  size: number;
  createdAt: Date;
  encrypted: boolean;
};

export type BackupManifest = {
  createdAt: string;
  site: string;
  reason: string;
  counts: Record<string, number>;
  files: string[];
};

/* -------------------------------------------------------------------------- */
/*                          minimal tar, no dependency                        */
/* -------------------------------------------------------------------------- */

type TarEntry = { name: string; data: Buffer };

function tarHeader(name: string, size: number, mtime: number): Buffer {
  const header = Buffer.alloc(512);
  const write = (value: string, offset: number, length: number) =>
    header.write(value.slice(0, length - 1).padEnd(length, "\0"), offset, "utf8");

  write(name, 0, 100);
  write("000644 \0", 100, 8);
  write("000000 \0", 108, 8);
  write("000000 \0", 116, 8);
  write(`${size.toString(8).padStart(11, "0")} `, 124, 12);
  write(`${Math.floor(mtime / 1000).toString(8).padStart(11, "0")} `, 136, 12);
  header.write("        ", 148, 8, "utf8"); // checksum field, filled in below
  header.write("0", 156, 1, "utf8");
  write("ustar\0", 257, 6);
  write("00", 263, 2);

  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "utf8");
  return header;
}

export function makeTar(entries: TarEntry[], mtime = Date.now()): Buffer {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    chunks.push(tarHeader(entry.name, entry.data.length, mtime));
    chunks.push(entry.data);
    const padding = (512 - (entry.data.length % 512)) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024)); // end of archive
  return Buffer.concat(chunks);
}

export function readTar(buffer: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    if (!name) break;

    const sizeField = header.subarray(124, 136).toString("utf8").replace(/[\0 ]/g, "");
    const size = parseInt(sizeField, 8) || 0;
    const start = offset + 512;
    entries.push({ name, data: buffer.subarray(start, start + size) });
    offset = start + size + ((512 - (size % 512)) % 512);
  }
  return entries;
}

/* -------------------------------------------------------------------------- */
/*                                   paths                                    */
/* -------------------------------------------------------------------------- */

/** Where the database file lives, derived from DATABASE_URL. */
export function databasePath(): string {
  const url = process.env.DATABASE_URL ?? "file:../data/fandogh.db";
  const relative = url.replace(/^file:/, "");
  return path.resolve(process.cwd(), "prisma", relative);
}

export function backupDir(): string {
  return path.resolve(
    /*turbopackIgnore: true*/ process.env.BACKUP_DIR || path.join(path.dirname(databasePath()), "backups"),
  );
}

/** Only our own archive names are accepted, which blocks path traversal. */
export function safeBackupName(name: string): string | null {
  const base = path.basename(name);
  const shaped = /^[A-Za-z0-9._-]+\.tar\.gz(\.enc)?$/.test(base);
  return shaped && base.startsWith(BACKUP_PREFIX) ? base : null;
}

export function isEncryptedName(name: string): boolean {
  return name.endsWith(".enc");
}

/* -------------------------------------------------------------------------- */
/*                                 encryption                                 */
/* -------------------------------------------------------------------------- */

/**
 * Optional passphrase protection.
 *
 * An archive holds every customer record and the panel credentials, so a file
 * that leaves the server should not be readable on its own. With a passphrase
 * in the settings, the gzip stream is sealed with AES-256-GCM and the key is
 * derived per file with scrypt, so the same passphrase never reuses a key.
 *
 * Layout: magic(9) | salt(16) | iv(12) | tag(16) | ciphertext
 */
const ENC_MAGIC = "FNDGHENC";
const ENC_VERSION = 1;
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = ENC_MAGIC.length + 1 + SALT_LEN + IV_LEN + TAG_LEN;

/** Was this buffer produced by encryptArchive? */
export function isEncryptedArchive(buffer: Buffer): boolean {
  return (
    buffer.length > HEADER_LEN &&
    buffer.subarray(0, ENC_MAGIC.length).toString("utf8") === ENC_MAGIC
  );
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password.normalize("NFKC"), salt, 32);
}

export function encryptArchive(plain: Buffer, password: string): Buffer {
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(password, salt), iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);

  return Buffer.concat([
    Buffer.from(ENC_MAGIC, "utf8"),
    Buffer.from([ENC_VERSION]),
    salt,
    iv,
    cipher.getAuthTag(),
    body,
  ]);
}

/** Returns null when the passphrase is wrong or the file was tampered with. */
export function decryptArchive(sealed: Buffer, password: string): Buffer | null {
  if (!isEncryptedArchive(sealed)) return null;

  let offset = ENC_MAGIC.length;
  const version = sealed[offset];
  offset += 1;
  if (version !== ENC_VERSION) return null;

  const salt = sealed.subarray(offset, (offset += SALT_LEN));
  const iv = sealed.subarray(offset, (offset += IV_LEN));
  const tag = sealed.subarray(offset, (offset += TAG_LEN));

  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(password, Buffer.from(salt)), iv);
    decipher.setAuthTag(Buffer.from(tag));
    return Buffer.concat([decipher.update(sealed.subarray(offset)), decipher.final()]);
  } catch {
    return null; // wrong passphrase: GCM refuses to authenticate
  }
}

/* -------------------------------------------------------------------------- */
/*                              creating backups                              */
/* -------------------------------------------------------------------------- */

async function collectUploads(): Promise<TarEntry[]> {
  const dir = uploadDir();
  try {
    const names = await readdir(/*turbopackIgnore: true*/ dir);
    const entries: TarEntry[] = [];
    for (const name of names) {
      const full = path.join(dir, name);
      const info = await stat(/*turbopackIgnore: true*/ full).catch(() => null);
      if (!info?.isFile()) continue;
      entries.push({ name: `uploads/${name}`, data: await readFile(/*turbopackIgnore: true*/ full) });
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Take a fresh backup.
 *
 * The WAL is checkpointed into the main file first, otherwise the archive
 * would miss the most recent transactions.
 */
export async function createBackup(reason = "manual"): Promise<{ file: string; size: number }> {
  // wal_checkpoint returns a row, so it has to go through the query API
  await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);").catch(() => null);

  const [settings, dbBuffer, uploads] = await Promise.all([
    getSettings(),
    readFile(/*turbopackIgnore: true*/ databasePath()),
    collectUploads(),
  ]);

  const counts = {
    users: await db.user.count(),
    services: await db.service.count(),
    orders: await db.order.count(),
    panels: await db.panel.count(),
    plans: await db.plan.count(),
  };

  const manifest: BackupManifest = {
    createdAt: new Date().toISOString(),
    site: settings.site_name,
    reason,
    counts,
    files: ["database.db", ...uploads.map((entry) => entry.name)],
  };

  const packed = gzipSync(
    makeTar([
      { name: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") },
      { name: "database.db", data: dbBuffer },
      ...uploads,
    ]),
    { level: 9 },
  );

  const password = settings.backup_password?.trim();
  const archive = password ? encryptArchive(packed, password) : packed;

  const stamp = new Date()
    .toISOString()
    .replace(/[:T]/g, "-")
    .replace(/\..+$/, "");
  const name = `${BACKUP_PREFIX}${stamp}.tar.gz${password ? ".enc" : ""}`;

  const dir = backupDir();
  await mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ path.join(dir, name), archive);

  return { file: name, size: archive.length };
}

export async function listBackups(): Promise<BackupFile[]> {
  const dir = backupDir();
  try {
    const names = await readdir(/*turbopackIgnore: true*/ dir);
    const files: BackupFile[] = [];
    for (const name of names) {
      if (!safeBackupName(name)) continue;
      const info = await stat(/*turbopackIgnore: true*/ path.join(dir, name)).catch(() => null);
      if (!info?.isFile()) continue;
      files.push({
        name,
        size: info.size,
        createdAt: info.mtime,
        encrypted: isEncryptedName(name),
      });
    }
    return files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    return [];
  }
}

export async function readBackup(name: string): Promise<Buffer | null> {
  const safe = safeBackupName(name);
  if (!safe) return null;
  return readFile(/*turbopackIgnore: true*/ path.join(backupDir(), safe)).catch(() => null);
}

export async function deleteBackup(name: string): Promise<boolean> {
  const safe = safeBackupName(name);
  if (!safe) return false;
  await rm(/*turbopackIgnore: true*/ path.join(backupDir(), safe), { force: true });
  return true;
}

/** Keep only the N most recent archives. */
export async function pruneBackups(keep: number): Promise<number> {
  if (keep <= 0) return 0;
  const files = await listBackups();
  const extra = files.slice(keep);
  for (const file of extra) await deleteBackup(file.name);
  return extra.length;
}

/* -------------------------------------------------------------------------- */
/*                                  restoring                                 */
/* -------------------------------------------------------------------------- */

/** Result codes; the admin actions turn these into Persian sentences. */
export type RestoreCode =
  | "restored"
  | "corrupt"
  | "not-a-backup"
  | "needs-password"
  | "bad-password"
  | "failed";

export type RestoreResult = {
  ok: boolean;
  code: RestoreCode;
  detail?: string;
  manifest?: BackupManifest;
  safetyCopy?: string;
};

/** Is this really a SQLite database file? */
function looksLikeSqlite(buffer: Buffer): boolean {
  return buffer.subarray(0, 15).toString("utf8") === "SQLite format 3";
}

/**
 * Restore an archive.
 *
 * A safety copy of the current state is taken first, then the connection is
 * closed so the file can be replaced, and the WAL side files are removed so
 * the restored database is not mixed with the previous state.
 */
export async function restoreBackup(archive: Buffer, password?: string): Promise<RestoreResult> {
  let payload = archive;

  if (isEncryptedArchive(archive)) {
    const pass = password?.trim();
    if (!pass) return { ok: false, code: "needs-password" };

    const opened = decryptArchive(archive, pass);
    if (!opened) return { ok: false, code: "bad-password" };
    payload = opened;
  }

  let entries: TarEntry[];
  try {
    entries = readTar(gunzipSync(payload));
  } catch {
    return { ok: false, code: "corrupt" };
  }

  const dbEntry = entries.find((entry) => entry.name === "database.db");
  if (!dbEntry || !looksLikeSqlite(Buffer.from(dbEntry.data))) {
    return { ok: false, code: "not-a-backup" };
  }

  let manifest: BackupManifest | undefined;
  const manifestEntry = entries.find((entry) => entry.name === "manifest.json");
  if (manifestEntry) {
    try {
      manifest = JSON.parse(manifestEntry.data.toString("utf8")) as BackupManifest;
    } catch {
      /* an archive without a readable manifest can still be restored */
    }
  }

  const safety = await createBackup("before-restore").catch(() => null);

  const target = databasePath();
  await db.$disconnect().catch(() => null);

  try {
    await writeFile(/*turbopackIgnore: true*/ target, Buffer.from(dbEntry.data));
    await rm(/*turbopackIgnore: true*/ `${target}-wal`, { force: true });
    await rm(/*turbopackIgnore: true*/ `${target}-shm`, { force: true });

    const uploads = entries.filter((entry) => entry.name.startsWith("uploads/"));
    if (uploads.length) {
      const dir = uploadDir();
      await mkdir(/*turbopackIgnore: true*/ dir, { recursive: true });
      for (const file of uploads) {
        const base = path.basename(file.name);
        if (!base || base.startsWith(".")) continue;
        await writeFile(/*turbopackIgnore: true*/ path.join(dir, base), Buffer.from(file.data));
      }
    }
  } catch (err) {
    return { ok: false, code: "failed", detail: (err as Error).message };
  }

  // reconnect: the next query opens the restored file
  await db.$queryRawUnsafe("SELECT 1").catch(() => null);

  return { ok: true, code: "restored", manifest, safetyCopy: safety?.file };
}

/* -------------------------------------------------------------------------- */
/*                        telegram delivery and schedule                      */
/* -------------------------------------------------------------------------- */

const TELEGRAM_LIMIT = 45 * 1024 * 1024;

export type SendCode = "sent" | "no-bot" | "missing" | "too-big" | "failed";

/** Send an archive to the admin chat on Telegram. */
export async function sendBackupToTelegram(
  name: string,
): Promise<{ ok: boolean; code: SendCode; detail?: string }> {
  const settings = await getSettings();
  const token = settings.telegram_bot_token?.trim();
  const chatId = settings.telegram_admin_chat_id?.trim();
  if (!token || !chatId) return { ok: false, code: "no-bot" };

  const buffer = await readBackup(name);
  if (!buffer) return { ok: false, code: "missing" };
  if (buffer.length > TELEGRAM_LIMIT) return { ok: false, code: "too-big" };

  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", `${settings.site_name}\n${name}`);
  form.append("document", new Blob([new Uint8Array(buffer)]), name);

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const json = (await res.json()) as { ok?: boolean; description?: string };
    return json.ok
      ? { ok: true, code: "sent" }
      : { ok: false, code: "failed", detail: json.description };
  } catch (err) {
    return { ok: false, code: "failed", detail: (err as Error).message };
  }
}

/** Is an automatic backup due? The interval is kept in the settings. */
export async function autoBackupDue(now = Date.now()): Promise<boolean> {
  const settings = await getSettings();
  if (!asBool(settings.backup_auto)) return false;

  const hours = Math.max(1, asNum(settings.backup_interval_hours, 24));
  const last = Number(settings.backup_last_at || 0);
  return now - last >= hours * 3_600_000;
}

/** One automatic round: create, prune the old ones, optionally send it out. */
export async function runAutoBackup(): Promise<{ file: string; sent: boolean } | null> {
  if (!(await autoBackupDue())) return null;

  const settings = await getSettings();
  const { file } = await createBackup("automatic");
  await pruneBackups(Math.max(1, asNum(settings.backup_keep, 7)));

  let sent = false;
  if (asBool(settings.backup_telegram)) {
    sent = (await sendBackupToTelegram(file)).ok;
  }

  await saveSettings({ backup_last_at: String(Date.now()) });
  return { file, sent };
}
