/**
 * Upload-safe seeds.
 * The local renderer keeps using hash32(file) — fast, deterministic, offline.
 * Anything that LEAVES the device must use uploadSeed() instead: an
 * HMAC-SHA256 over the filename with a per-city random key, so a server-side
 * leak cannot confirm dictionary guesses against note filenames (FNV-1a's
 * 32-bit space offers no such protection).
 *
 * Threat model (documented on purpose): the device-held key defends against
 * an attacker who obtains uploaded data — not against XSS or local malware.
 * If/when a backend exists, deriving per-city keys in a server-side KMS is
 * the stronger design; this module keeps that swap cheap.
 */

const DB_NAME = "yeyufm";
const KEY_ID = "city-key-v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.open(DB_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let cached: CryptoKey | null = null;

/** Random per-city HMAC key, generated once, non-extractable, device-only. */
export async function getCityKey(): Promise<CryptoKey> {
  if (cached) return cached;
  const db = await openDb();
  if (!db.objectStoreNames.contains("meta")) {
    // store missing (very old DB) — fall back to an ephemeral key
    cached = await generateKey();
    return cached;
  }
  const existing = await new Promise<CryptoKey | undefined>((resolve) => {
    const tx = db.transaction("meta", "readonly");
    const req = tx.objectStore("meta").get(KEY_ID);
    req.onsuccess = () =>
      resolve((req.result as { key?: CryptoKey } | undefined)?.key);
    req.onerror = () => resolve(undefined);
  });
  if (existing) {
    cached = existing;
    return existing;
  }
  const key = await generateKey();
  await new Promise<void>((resolve) => {
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").put({ file: KEY_ID, key });
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  cached = key;
  return key;
}

function generateKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-256" },
    false, // non-extractable
    ["sign"],
  );
}

/** Opaque seed for anything that leaves the device. Full 128-bit truncation. */
export async function uploadSeed(file: string): Promise<string> {
  const key = await getCityKey();
  const mac = await window.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(file.normalize("NFC")),
  );
  return [...new Uint8Array(mac).slice(0, 16)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
