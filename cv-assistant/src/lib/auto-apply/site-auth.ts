import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type SavedSiteCredentials = {
  username?: string;
  password?: string;
};

type SavedSiteAuthRecord = {
  siteKey: string;
  origin: string;
  hostname: string;
  storageStatePath: string;
  rememberCredentials: boolean;
  credentials?: {
    username?: string;
    password?: string;
  };
  updatedAt: string;
};

function getAuthSecret() {
  return process.env.AUTO_APPLY_SITE_AUTH_SECRET || process.env.JWT_SECRET || "cv-assistant-site-auth";
}

function deriveKey() {
  return crypto.createHash("sha256").update(getAuthSecret()).digest();
}

export function normalizeSiteKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getSiteOrigin(url: string) {
  return new URL(url).origin;
}

export function getSiteHostname(url: string) {
  return new URL(url).hostname;
}

export function getSiteKeyFromUrl(url: string) {
  return normalizeSiteKey(getSiteHostname(url));
}

export function getSiteAuthBaseDir() {
  return path.join(process.cwd(), ".codex-data", "auto-apply", "site-auth");
}

export function getSiteAuthRecordPath(userId: string, siteKey: string) {
  return path.join(getSiteAuthBaseDir(), userId, `${normalizeSiteKey(siteKey)}.json`);
}

export async function ensureDirectory(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export function encryptSiteSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptSiteSecret(value: string) {
  const raw = Buffer.from(value, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export async function loadSavedSiteAuth(userId: string, siteKey: string) {
  const recordPath = getSiteAuthRecordPath(userId, siteKey);
  const contents = await fs.readFile(recordPath, "utf8").catch(() => "");
  if (!contents) return null;
  try {
    return JSON.parse(contents) as SavedSiteAuthRecord;
  } catch {
    return null;
  }
}

export async function saveSiteAuthState(args: {
  userId: string;
  siteKey: string;
  origin: string;
  hostname: string;
  storageState: unknown;
  credentials?: SavedSiteCredentials;
  rememberCredentials?: boolean;
}) {
  const recordPath = getSiteAuthRecordPath(args.userId, args.siteKey);
  await ensureDirectory(recordPath);
  const storageStatePath = path.join(path.dirname(recordPath), `${normalizeSiteKey(args.siteKey)}.storage.json`);
  await fs.writeFile(storageStatePath, JSON.stringify(args.storageState, null, 2), "utf8");

  const record: SavedSiteAuthRecord = {
    siteKey: normalizeSiteKey(args.siteKey),
    origin: args.origin,
    hostname: args.hostname,
    storageStatePath,
    rememberCredentials: Boolean(args.rememberCredentials),
    updatedAt: new Date().toISOString(),
  };

  if (args.rememberCredentials && (args.credentials?.username || args.credentials?.password)) {
    record.credentials = {
      username: args.credentials?.username ? encryptSiteSecret(args.credentials.username) : undefined,
      password: args.credentials?.password ? encryptSiteSecret(args.credentials.password) : undefined,
    };
  }

  await fs.writeFile(recordPath, JSON.stringify(record, null, 2), "utf8");
  return record;
}

export async function loadSavedSiteStorageState(userId: string, siteKey: string) {
  const record = await loadSavedSiteAuth(userId, siteKey);
  if (!record) return null;
  const storageState = await fs.readFile(record.storageStatePath, "utf8").catch(() => "");
  if (!storageState) return null;
  return { record, storageStatePath: record.storageStatePath, storageState: JSON.parse(storageState) };
}
