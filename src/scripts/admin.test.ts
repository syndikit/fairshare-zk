// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generatePartKey,
  generateAdminKeyPair,
  generateHmacKey,
  encrypt,
  exportKey,
  encryptGebot,
  hmac,
} from '../lib/crypto';
import { generiereEmojiId } from '../lib/solidarisch';
import { initAdmin } from './admin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupDom() {
  document.body.innerHTML = `
    <div id="zustand-laden"></div>
    <div id="zustand-fehler" class="hidden"></div>
    <div id="zustand-auswertung" class="hidden"></div>
    <p id="fehler-text"></p>
    <h1 id="runde-name"></h1>
    <span id="kz-gesamtkosten"></span>
    <span id="kz-richtwert"></span>
    <span id="kz-summe-beitraege"></span>
    <div id="duplikat-box" class="hidden"></div>
    <ul id="duplikat-liste"></ul>
    <div id="status-banner" class="hidden"></div>
    <div id="slots-container"></div>
    <div id="ausgleich-section" class="hidden"></div>
    <div id="ausgleich-liste"></div>
    <p id="gebote-anzahl"></p>
    <button id="wiederholen-btn"></button>
  `;
}

interface TestKeys {
  partKeyB64: string;
  adminPrivKeyB64: string;
  encTeilnehmerBlob: string;
  adminPubKey: CryptoKey;
  adminPrivKey: CryptoKey;
  hmacKey: CryptoKey;
}

async function createTestKeys(slotOverrides?: Partial<{ anzahl: number }>): Promise<TestKeys> {
  const partKey = await generatePartKey();
  const { publicKey: adminPubKey, privateKey: adminPrivKey } = await generateAdminKeyPair();
  const hmacKey = await generateHmacKey();

  const partKeyB64 = await exportKey(partKey);
  const adminPrivKeyB64 = await exportKey(adminPrivKey);
  const adminPubKeyB64 = await exportKey(adminPubKey);
  const hmacKeyB64 = await exportKey(hmacKey);

  const blobData = {
    rundeName: 'Testrunde Admin',
    gesamtkosten: 600,
    adminPubKey: adminPubKeyB64,
    hmacKey: hmacKeyB64,
    slots: [{ label: 'Erwachsen', gewichtung: 1.0, anzahl: slotOverrides?.anzahl ?? 1 }],
  };
  const encTeilnehmerBlob = await encrypt(partKey, JSON.stringify(blobData));

  return { partKeyB64, adminPrivKeyB64, encTeilnehmerBlob, adminPubKey, adminPrivKey, hmacKey };
}

async function createEncryptedGebot(adminPubKey: CryptoKey, hmacKey: CryptoKey, betrag = 80) {
  const emojiId = generiereEmojiId();
  const emojiHmac = await hmac(hmacKey, emojiId);
  const encGebot = await encryptGebot(adminPubKey, JSON.stringify({
    emojiId,
    slotLabel: 'Erwachsen',
    gewichtung: 1.0,
    betrag,
  }));
  return { emojiHmac, encGebot };
}

function mockLocation(pathname: string, hash: string) {
  Object.defineProperty(window, 'location', {
    value: {
      hash,
      href: `http://localhost${pathname}${hash}`,
      pathname,
    },
    writable: true,
    configurable: true,
  });
  vi.stubGlobal('history', { replaceState: vi.fn() });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initAdmin', () => {
  beforeEach(() => {
    setupDom();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('zeigt Fehler wenn pk fehlt', async () => {
    mockLocation('/runde/abc12345/admin/tok123', '#bk=irgendwas');
    vi.stubGlobal('fetch', vi.fn());

    await initAdmin();

    expect(document.getElementById('zustand-fehler')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('fehler-text')!.textContent).toContain('pk');
  });

  it('zeigt Fehler wenn bk fehlt', async () => {
    mockLocation('/runde/abc12345/admin/tok123', '#pk=irgendwas');
    vi.stubGlobal('fetch', vi.fn());

    await initAdmin();

    expect(document.getElementById('zustand-fehler')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('fehler-text')!.textContent).toContain('bk');
  });

  it('zeigt Fehler wenn Runde nicht gefunden', async () => {
    const { partKeyB64, adminPrivKeyB64 } = await createTestKeys();
    mockLocation('/runde/abc12345/admin/tok123', `#pk=${partKeyB64}&bk=${adminPrivKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await initAdmin();

    expect(document.getElementById('fehler-text')!.textContent).toContain('nicht gefunden');
  });

  it('rendert leere Runde ohne Gebote korrekt', async () => {
    const { partKeyB64, adminPrivKeyB64, encTeilnehmerBlob } = await createTestKeys();
    mockLocation('/runde/abc12345/admin/tok123', `#pk=${partKeyB64}&bk=${adminPrivKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob, gebote: [] }),
    }));

    await initAdmin();

    expect(document.getElementById('runde-name')!.textContent).toBe('Testrunde Admin');
    expect(document.getElementById('kz-gesamtkosten')!.textContent).toContain('600');
    expect(document.getElementById('zustand-auswertung')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('status-banner')!.textContent).toContain('ausstehend');
  });

  it('zeigt vollständige Auswertung wenn alle Gebote eingegangen sind', async () => {
    const keys = await createTestKeys({ anzahl: 1 });
    // Betrag = Gesamtkosten → kein Fehlbetrag
    const gebot = await createEncryptedGebot(keys.adminPubKey, keys.hmacKey, 600);
    mockLocation('/runde/abc12345/admin/tok123', `#pk=${keys.partKeyB64}&bk=${keys.adminPrivKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob: keys.encTeilnehmerBlob, gebote: [gebot] }),
    }));

    await initAdmin();

    expect(document.getElementById('status-banner')!.textContent).toContain('vollständig');
    expect(document.getElementById('kz-richtwert')!.textContent).not.toBe('');
  });

  it('feuert DELETE-Request beim Klick auf Löschen-Button', async () => {
    const keys = await createTestKeys({ anzahl: 1 });
    const gebot = await createEncryptedGebot(keys.adminPubKey, keys.hmacKey);
    mockLocation('/runde/abc12345/admin/tok123', `#pk=${keys.partKeyB64}&bk=${keys.adminPrivKeyB64}`);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob: keys.encTeilnehmerBlob, gebote: [gebot] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await initAdmin();

    // Löschen-Button im gerenderten Slot finden und klicken
    const loeschenBtn = document.querySelector<HTMLButtonElement>('.loeschen-btn')!;
    expect(loeschenBtn).not.toBeNull();

    fetchMock.mockResolvedValue({ ok: true });
    loeschenBtn.click();

    await vi.waitFor(() => {
      const deleteCalls = fetchMock.mock.calls.filter(c => c[1]?.method === 'DELETE');
      expect(deleteCalls.length).toBe(1);
    });

    const deleteCalls = fetchMock.mock.calls.filter(c => c[1]?.method === 'DELETE');
    expect(deleteCalls[0][1].body).toContain(gebot.emojiHmac);
  });

  it('entfernt Fragment aus URL nach dem Laden', async () => {
    const { partKeyB64, adminPrivKeyB64, encTeilnehmerBlob } = await createTestKeys();
    mockLocation('/runde/abc12345/admin/tok123', `#pk=${partKeyB64}&bk=${adminPrivKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob, gebote: [] }),
    }));

    await initAdmin();

    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/runde/abc12345/admin/tok123');
  });
});
