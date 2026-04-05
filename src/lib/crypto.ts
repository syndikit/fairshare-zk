/**
 * FairShare ZK — Crypto primitives
 * Alle Krypto-Operationen ausschließlich über WebCrypto API (kein npm-Paket).
 *
 * Formate:
 *   AES-GCM:  "<iv_b64url>.<ciphertext_b64url>"
 *   ECDH:     "<ephemPubKey_b64url>.<iv_b64url>.<ciphertext_b64url>"
 */

// ---------------------------------------------------------------------------
// Base64url helpers
// ---------------------------------------------------------------------------

function bufToB64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlToBuf(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/** Erzeugt einen AES-256-GCM-Schlüssel für den Teilnehmer-Blob. */
export async function generatePartKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

/** Erzeugt ein ECDH-P-256-Schlüsselpaar für Admin (Gebote ver-/entschlüsseln). */
export async function generateAdminKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
  ]);
}

/** Erzeugt einen HMAC-SHA-256-Schlüssel für Emoji-IDs. */
export async function generateHmacKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
}

// ---------------------------------------------------------------------------
// AES-GCM: Teilnehmer-Blob
// ---------------------------------------------------------------------------

/** Verschlüsselt einen String mit AES-256-GCM. Gibt "<iv>.<ciphertext>" zurück (Base64url). */
export async function encrypt(key: CryptoKey, data: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return `${bufToB64url(iv)}.${bufToB64url(cipherBuf)}`;
}

/** Entschlüsselt einen "<iv>.<ciphertext>"-String (Base64url) mit AES-256-GCM. */
export async function decrypt(key: CryptoKey, cipher: string): Promise<string> {
  const [ivB64, ctB64] = cipher.split('.');
  if (!ivB64 || !ctB64) throw new Error('Ungültiges Ciphertext-Format');
  const iv = b64urlToBuf(ivB64);
  const ct = b64urlToBuf(ctB64);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(plainBuf);
}

// ---------------------------------------------------------------------------
// ECDH: Gebote
// ---------------------------------------------------------------------------

/**
 * Verschlüsselt ein Gebot mit dem öffentlichen Admin-Schlüssel.
 * Ephemerer ECDH → HKDF → AES-256-GCM.
 * Gibt "<ephemPubKey>.<iv>.<ciphertext>" zurück (Base64url).
 */
export async function encryptGebot(pubKey: CryptoKey, data: string): Promise<string> {
  // Ephemeres ECDH-Keypair
  const ephemPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );

  // Shared secret → AES-256-GCM-Schlüssel via HKDF
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: pubKey },
    ephemPair.privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );

  // Verschlüsseln
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);

  // Ephemeren Public Key exportieren
  const ephemPubBuf = await crypto.subtle.exportKey('raw', ephemPair.publicKey);

  return `${bufToB64url(ephemPubBuf)}.${bufToB64url(iv)}.${bufToB64url(cipherBuf)}`;
}

/**
 * Entschlüsselt ein Gebot mit dem privaten Admin-Schlüssel.
 * Erwartet "<ephemPubKey>.<iv>.<ciphertext>" (Base64url).
 */
export async function decryptGebot(privKey: CryptoKey, cipher: string): Promise<string> {
  const parts = cipher.split('.');
  if (parts.length !== 3) throw new Error('Ungültiges Gebot-Format');
  const [ephemPubB64, ivB64, ctB64] = parts;

  // Ephemeren Public Key importieren
  const ephemPubKey = await crypto.subtle.importKey(
    'raw',
    b64urlToBuf(ephemPubB64),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  // Shared secret → AES-256-GCM-Schlüssel via HKDF
  const aesKey = await crypto.subtle.deriveKey(
    { name: 'ECDH', public: ephemPubKey },
    privKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt'],
  );

  const iv = b64urlToBuf(ivB64);
  const ct = b64urlToBuf(ctB64);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
  return new TextDecoder().decode(plainBuf);
}

// ---------------------------------------------------------------------------
// HMAC: Emoji-ID
// ---------------------------------------------------------------------------

/** Gibt HMAC-SHA-256 über `data` zurück (Base64url). */
export async function hmac(key: CryptoKey, data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data);
  const sig = await crypto.subtle.sign('HMAC', key, encoded);
  return bufToB64url(sig);
}

// ---------------------------------------------------------------------------
// Serialisierung: Base64url ↔ CryptoKey
// ---------------------------------------------------------------------------

/** Exportiert einen CryptoKey als Base64url-String. */
export async function exportKey(key: CryptoKey): Promise<string> {
  const format = key.type === 'secret' ? 'raw' : key.type === 'private' ? 'pkcs8' : 'spki';
  const buf = await crypto.subtle.exportKey(format, key);
  return bufToB64url(buf);
}

/** Importiert einen AES-256-GCM-Schlüssel (partKey) aus Base64url. */
export async function importPartKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    b64urlToBuf(raw),
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

/** Importiert den privaten ECDH-Schlüssel (adminPrivKey) aus Base64url (PKCS8). */
export async function importAdminPrivKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    b64urlToBuf(raw),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );
}

/** Importiert den öffentlichen ECDH-Schlüssel (adminPubKey) aus Base64url (SPKI). */
export async function importAdminPubKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'spki',
    b64urlToBuf(raw),
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    [],
  );
}

/** Importiert einen HMAC-SHA-256-Schlüssel aus Base64url. */
export async function importHmacKey(raw: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    b64urlToBuf(raw),
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
}
