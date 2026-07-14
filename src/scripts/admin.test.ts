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
import { initAdmin, baueWiederholenPayload } from './admin';

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
    <div class="vollstaendig-spalte hidden">
      <span id="kz-summe-beitraege"></span>
    </div>
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

async function createTestKeys(slotOverrides?: Partial<{
  anzahl: number;
  ausgaben: number;
  slots: { label: string; gewichtung: number; anzahl: number; ausgaben?: number; standardgebot?: number }[];
  teildeckungModus: boolean;
  dreiGebotModus: boolean;
}>): Promise<TestKeys> {
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
    slots: slotOverrides?.slots ?? [{
      label: 'Erwachsen',
      gewichtung: 1.0,
      anzahl: slotOverrides?.anzahl ?? 1,
      ...(slotOverrides?.ausgaben !== undefined ? { ausgaben: slotOverrides.ausgaben } : {}),
    }],
    ...(slotOverrides?.teildeckungModus !== undefined ? { teildeckungModus: slotOverrides.teildeckungModus } : {}),
    ...(slotOverrides?.dreiGebotModus !== undefined ? { dreiGebotModus: slotOverrides.dreiGebotModus } : {}),
  };
  const encTeilnehmerBlob = await encrypt(partKey, JSON.stringify(blobData));

  return { partKeyB64, adminPrivKeyB64, encTeilnehmerBlob, adminPubKey, adminPrivKey, hmacKey };
}

async function createEncryptedGebot(adminPubKey: CryptoKey, hmacKey: CryptoKey, betrag = 80, slotLabel = 'Erwachsen') {
  const emojiId = generiereEmojiId();
  const emojiHmac = await hmac(hmacKey, emojiId);
  const encGebot = await encryptGebot(adminPubKey, JSON.stringify({
    emojiId,
    slotLabel,
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
// localStorage-Mock (happy-dom localStorage ist nicht vollständig implementiert)
// ---------------------------------------------------------------------------

function makeLocalStorageMock() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = String(value); },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('initAdmin', () => {
  beforeEach(() => {
    setupDom();
    vi.stubGlobal('localStorage', makeLocalStorageMock());
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

  it('zeigt Beiträge im (Teil-)Deckungsmodus live an, trotz Fehlbetrag und Unvollständigkeit', async () => {
    const keys = await createTestKeys({
      slots: [
        { label: 'Slot A', gewichtung: 1.0, anzahl: 1 },
        { label: 'Slot B', gewichtung: 1.0, anzahl: 1 },
      ],
      teildeckungModus: true,
    });
    // Nur ein Gebot, deutlich unter dem Richtwert-Anteil (300) → Fehlbetrag, allesDa=false
    const gebot = await createEncryptedGebot(keys.adminPubKey, keys.hmacKey, 100, 'Slot A');
    mockLocation('/runde/abc12345/admin/tok123', `#pk=${keys.partKeyB64}&bk=${keys.adminPrivKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob: keys.encTeilnehmerBlob, gebote: [gebot] }),
    }));

    await initAdmin();

    expect(document.getElementById('status-banner')!.textContent).toContain('Ziel noch nicht erreicht');
    expect(document.getElementById('status-banner')!.textContent).toContain('anderweitig gedeckt');
    expect(document.querySelector('.vollstaendig-spalte')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('kz-summe-beitraege')!.textContent).toContain('100');
    expect(document.querySelector('[data-emoji-hmac]')!.textContent).toContain('100');
  });

  it('zeigt normale Auswertung wenn das Ziel im (Teil-)Deckungsmodus erreicht ist, auch ohne dass alle geboten haben', async () => {
    const keys = await createTestKeys({
      slots: [
        { label: 'Slot A', gewichtung: 1.0, anzahl: 1 },
        { label: 'Slot B', gewichtung: 1.0, anzahl: 1 },
      ],
      teildeckungModus: true,
    });
    // Nur ein Gebot, deckt aber allein schon die Gesamtkosten → Ziel erreicht trotz allesDa=false
    const gebot = await createEncryptedGebot(keys.adminPubKey, keys.hmacKey, 600, 'Slot A');
    mockLocation('/runde/abc12345/admin/tok123', `#pk=${keys.partKeyB64}&bk=${keys.adminPrivKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob: keys.encTeilnehmerBlob, gebote: [gebot] }),
    }));

    await initAdmin();

    expect(document.getElementById('status-banner')!.textContent).toContain('Ziel erreicht');
    expect(document.querySelector('.vollstaendig-spalte')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('kz-summe-beitraege')!.textContent).not.toBe('');
  });

  it('berechnet keine Ausgleichszahlungen im (Teil-)Deckungsmodus solange ein Fehlbetrag besteht', async () => {
    const keys = await createTestKeys({
      slots: [
        { label: 'Slot A', gewichtung: 1.0, anzahl: 1, ausgaben: 50 },
        { label: 'Slot B', gewichtung: 1.0, anzahl: 1, ausgaben: 250 },
      ],
      teildeckungModus: true,
    });
    const gebot = await createEncryptedGebot(keys.adminPubKey, keys.hmacKey, 100, 'Slot A');
    mockLocation('/runde/abc12345/admin/tok123', `#pk=${keys.partKeyB64}&bk=${keys.adminPrivKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob: keys.encTeilnehmerBlob, gebote: [gebot] }),
    }));

    await initAdmin();

    expect(document.getElementById('ausgleich-section')!.classList.contains('hidden')).toBe(true);
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

  it('speichert Runde mit Admin-Link in localStorage nach erfolgreichem Öffnen', async () => {
    const { partKeyB64, adminPrivKeyB64, encTeilnehmerBlob } = await createTestKeys();
    mockLocation('/runde/abc12345/admin/tok123', `#pk=${partKeyB64}&bk=${adminPrivKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob, gebote: [] }),
    }));

    await initAdmin();

    const raw = localStorage.getItem('fairshare_runden');
    expect(raw).not.toBeNull();
    const runden = JSON.parse(raw!);
    expect(runden).toHaveLength(1);
    expect(runden[0].id).toBe('abc12345');
    expect(runden[0].adminLink).toContain('/runde/abc12345/admin/tok123');
    expect(runden[0].adminLink).toContain(`pk=${partKeyB64}`);
    expect(runden[0].adminLink).toContain(`bk=${adminPrivKeyB64}`);
    expect(runden[0].name).toBe('Testrunde Admin');
  });

  it('speichert Runde nicht wenn pk oder bk fehlt', async () => {
    mockLocation('/runde/abc12345/admin/tok123', '#bk=irgendwas');
    vi.stubGlobal('fetch', vi.fn());

    await initAdmin();

    expect(localStorage.getItem('fairshare_runden')).toBeNull();
  });

  it('ruft confirm auf und speichert Ausgaben bei OK', async () => {
    const keys = await createTestKeys({ ausgaben: 200 });
    mockLocation('/runde/abc12345/admin/tok123', `#pk=${keys.partKeyB64}&bk=${keys.adminPrivKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob: keys.encTeilnehmerBlob, gebote: [] }),
    }));
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    const sessionStorageMock = makeLocalStorageMock();
    vi.stubGlobal('sessionStorage', sessionStorageMock);

    await initAdmin();
    document.getElementById('wiederholen-btn')!.click();

    expect(confirm).toHaveBeenCalledWith('Ausgaben aus dieser Runde übernehmen?');
    const payload = JSON.parse(sessionStorageMock.getItem('rundeWiederholen')!);
    expect(payload.slots[0].ausgaben).toBe(200);
  });

  it('speichert Payload ohne Ausgaben wenn confirm abgebrochen', async () => {
    const keys = await createTestKeys({ ausgaben: 200 });
    mockLocation('/runde/abc12345/admin/tok123', `#pk=${keys.partKeyB64}&bk=${keys.adminPrivKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob: keys.encTeilnehmerBlob, gebote: [] }),
    }));
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    const sessionStorageMock = makeLocalStorageMock();
    vi.stubGlobal('sessionStorage', sessionStorageMock);

    await initAdmin();
    document.getElementById('wiederholen-btn')!.click();

    const payload = JSON.parse(sessionStorageMock.getItem('rundeWiederholen')!);
    expect(payload.slots[0]).not.toHaveProperty('ausgaben');
  });

  it('navigiert ohne confirm wenn keine Ausgaben vorhanden', async () => {
    const keys = await createTestKeys({ anzahl: 1 });
    mockLocation('/runde/abc12345/admin/tok123', `#pk=${keys.partKeyB64}&bk=${keys.adminPrivKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob: keys.encTeilnehmerBlob, gebote: [] }),
    }));
    vi.stubGlobal('confirm', vi.fn());
    const sessionStorageMock = makeLocalStorageMock();
    vi.stubGlobal('sessionStorage', sessionStorageMock);

    await initAdmin();
    document.getElementById('wiederholen-btn')!.click();

    expect(confirm).not.toHaveBeenCalled();
    expect(sessionStorageMock.getItem('rundeWiederholen')).not.toBeNull();
  });

  it('upgradet bestehenden Teilnehmer-Eintrag auf Admin-Link', async () => {
    const { partKeyB64, adminPrivKeyB64, encTeilnehmerBlob } = await createTestKeys();
    // Vorher: Eintrag ohne adminLink (wie nach Gebot-Abgabe)
    localStorage.setItem('fairshare_runden', JSON.stringify([{
      id: 'abc12345',
      name: 'Testrunde Admin',
      hinzugefuegtAm: '2024-01-01T00:00:00.000Z',
      teilnehmerLink: 'http://localhost/runde/abc12345#pk=alterpk',
    }]));

    mockLocation('/runde/abc12345/admin/tok123', `#pk=${partKeyB64}&bk=${adminPrivKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob, gebote: [] }),
    }));

    await initAdmin();

    const runden = JSON.parse(localStorage.getItem('fairshare_runden')!);
    expect(runden).toHaveLength(1);
    expect(runden[0].adminLink).toContain('/runde/abc12345/admin/tok123');
  });
});

// ---------------------------------------------------------------------------
// baueWiederholenPayload
// ---------------------------------------------------------------------------

const testBlob = {
  rundeName: 'Testrunde',
  gesamtkosten: 600,
  slots: [
    { label: 'Erwachsen', gewichtung: 1, anzahl: 3, ausgaben: 200 },
    { label: 'Kind', gewichtung: 0.5, anzahl: 2, ausgaben: 100, standardgebot: 50 },
    { label: 'Ohne Ausgaben', gewichtung: 1, anzahl: 1 },
  ],
};

describe('baueWiederholenPayload', () => {
  it('enthält keine ausgaben wenn mitAusgaben=false (Nein-Pfad)', () => {
    const payload = baueWiederholenPayload(testBlob, false);
    for (const slot of payload.slots) {
      expect(slot).not.toHaveProperty('ausgaben');
    }
  });

  it('enthält ausgaben für Slots mit Ausgaben wenn mitAusgaben=true (Ja-Pfad)', () => {
    const payload = baueWiederholenPayload(testBlob, true);
    expect(payload.slots[0].ausgaben).toBe(200);
    expect(payload.slots[1].ausgaben).toBe(100);
  });

  it('lässt Slot ohne ausgaben auch bei mitAusgaben=true ohne ausgaben', () => {
    const payload = baueWiederholenPayload(testBlob, true);
    expect(payload.slots[2]).not.toHaveProperty('ausgaben');
  });

  it('überträgt name und kosten korrekt', () => {
    const payload = baueWiederholenPayload(testBlob, false);
    expect(payload.name).toBe('Testrunde');
    expect(payload.kosten).toBe(600);
  });

  it('überträgt standardgebot unabhängig von mitAusgaben', () => {
    expect(baueWiederholenPayload(testBlob, false).slots[1].standardgebot).toBe(50);
    expect(baueWiederholenPayload(testBlob, true).slots[1].standardgebot).toBe(50);
  });

  it('überträgt label, gewichtung und anzahl', () => {
    const payload = baueWiederholenPayload(testBlob, false);
    expect(payload.slots[0]).toMatchObject({ label: 'Erwachsen', gewichtung: 1, anzahl: 3 });
  });
});
