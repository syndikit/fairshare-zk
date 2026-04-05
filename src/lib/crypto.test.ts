import { describe, it, expect } from 'vitest';
import {
  generatePartKey,
  generateAdminKeyPair,
  generateHmacKey,
  encrypt,
  decrypt,
  encryptGebot,
  decryptGebot,
  hmac,
  exportKey,
  importPartKey,
  importAdminPrivKey,
  importAdminPubKey,
  importHmacKey,
} from './crypto';

describe('AES-GCM', () => {
  it('Roundtrip: encrypt → decrypt ergibt Original', async () => {
    const key = await generatePartKey();
    const plain = 'Hallo FairShare!';
    expect(await decrypt(key, await encrypt(key, plain))).toBe(plain);
  });

  it('Roundtrip: Sonderzeichen (Unicode, Emojis, JSON)', async () => {
    const key = await generatePartKey();
    const plain = JSON.stringify({ name: 'Müller & Söhne', emojis: '🎉🦄💸', amount: 42.5 });
    expect(await decrypt(key, await encrypt(key, plain))).toBe(plain);
  });

  it('Jedes encrypt erzeugt anderen IV (Ciphertext unterschiedlich)', async () => {
    const key = await generatePartKey();
    const plain = 'gleicher Text';
    const c1 = await encrypt(key, plain);
    const c2 = await encrypt(key, plain);
    expect(c1).not.toBe(c2);
  });

  it('Falscher Schlüssel → throws', async () => {
    const key1 = await generatePartKey();
    const key2 = await generatePartKey();
    const cipher = await encrypt(key1, 'geheim');
    await expect(decrypt(key2, cipher)).rejects.toThrow();
  });

  it('Manipulierter Ciphertext → throws (AEAD-Integrität)', async () => {
    const key = await generatePartKey();
    const cipher = await encrypt(key, 'geheim');
    const [iv, ct] = cipher.split('.');
    // Erstes Zeichen ändern — hat immer 6 signifikante Bits, unabhängig vom Padding
    const differentChar = ct[0] === 'A' ? 'B' : 'A';
    const tampered = `${iv}.${differentChar}${ct.slice(1)}`;
    await expect(decrypt(key, tampered)).rejects.toThrow();
  });

  it('Ungültiges Format (kein Punkt) → throws', async () => {
    const key = await generatePartKey();
    await expect(decrypt(key, 'keinPunktImString')).rejects.toThrow();
  });
});

describe('ECDH (Gebote)', () => {
  it('Roundtrip: encryptGebot → decryptGebot mit korrektem keypair', async () => {
    const { publicKey, privateKey } = await generateAdminKeyPair();
    const plain = JSON.stringify({ betrag: 150, slotTyp: 'Standard' });
    expect(await decryptGebot(privateKey, await encryptGebot(publicKey, plain))).toBe(plain);
  });

  it('Falscher privater Schlüssel → throws', async () => {
    const { publicKey } = await generateAdminKeyPair();
    const { privateKey: wrongPrivKey } = await generateAdminKeyPair();
    const cipher = await encryptGebot(publicKey, 'geheim');
    await expect(decryptGebot(wrongPrivKey, cipher)).rejects.toThrow();
  });

  it('Falscher Public Key beim Verschlüsseln → throws beim Entschlüsseln', async () => {
    const { privateKey } = await generateAdminKeyPair();
    const { publicKey: wrongPubKey } = await generateAdminKeyPair();
    const cipher = await encryptGebot(wrongPubKey, 'geheim');
    await expect(decryptGebot(privateKey, cipher)).rejects.toThrow();
  });

  it('Format: drei Teile getrennt durch Punkte', async () => {
    const { publicKey } = await generateAdminKeyPair();
    const cipher = await encryptGebot(publicKey, 'test');
    expect(cipher.split('.')).toHaveLength(3);
  });

  it('Ungültiges Format (nur 2 Teile) → throws', async () => {
    const { privateKey } = await generateAdminKeyPair();
    await expect(decryptGebot(privateKey, 'teil1.teil2')).rejects.toThrow();
  });
});

describe('HMAC (Emoji-ID)', () => {
  it('Deterministisch: gleiche Eingabe → gleicher Hash', async () => {
    const key = await generateHmacKey();
    const h1 = await hmac(key, '🦄🎉💸');
    const h2 = await hmac(key, '🦄🎉💸');
    expect(h1).toBe(h2);
  });

  it('Verschiedene Eingaben → verschiedene Hashes', async () => {
    const key = await generateHmacKey();
    expect(await hmac(key, 'abc')).not.toBe(await hmac(key, 'xyz'));
  });

  it('Verschiedene Schlüssel → verschiedene Hashes', async () => {
    const key1 = await generateHmacKey();
    const key2 = await generateHmacKey();
    expect(await hmac(key1, 'gleich')).not.toBe(await hmac(key2, 'gleich'));
  });
});

describe('Key Export/Import', () => {
  it('partKey: exportKey → importPartKey → encrypt/decrypt funktioniert', async () => {
    const key = await generatePartKey();
    const exported = await exportKey(key);
    const imported = await importPartKey(exported);
    const plain = 'Roundtrip über Serialisierung';
    expect(await decrypt(imported, await encrypt(key, plain))).toBe(plain);
  });

  it('adminKeyPair: exportKey → import → encryptGebot/decryptGebot funktioniert', async () => {
    const { publicKey, privateKey } = await generateAdminKeyPair();
    const exportedPub = await exportKey(publicKey);
    const exportedPriv = await exportKey(privateKey);
    const importedPub = await importAdminPubKey(exportedPub);
    const importedPriv = await importAdminPrivKey(exportedPriv);
    const plain = 'Gebot nach Serialisierung';
    expect(await decryptGebot(importedPriv, await encryptGebot(importedPub, plain))).toBe(plain);
  });

  it('hmacKey: exportKey → importHmacKey → hmac funktioniert', async () => {
    const key = await generateHmacKey();
    const exported = await exportKey(key);
    const imported = await importHmacKey(exported);
    const input = 'Emoji-ID-Test';
    expect(await hmac(key, input)).toBe(await hmac(imported, input));
  });
});
