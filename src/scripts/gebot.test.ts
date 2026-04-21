// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generatePartKey,
  generateAdminKeyPair,
  generateHmacKey,
  encrypt,
  exportKey,
} from '../lib/crypto';
import { initGebot } from './gebot';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setupDom() {
  document.body.innerHTML = `
    <div id="zustand-laden"></div>
    <div id="zustand-formular" class="hidden"></div>
    <div id="zustand-fehler" class="hidden"></div>
    <div id="zustand-bestaetigung" class="hidden"></div>
    <p id="fehler-text"></p>
    <h1 id="runde-name"></h1>
    <span id="gesamtkosten"></span>
    <div id="slot-auswahl"></div>
    <div id="slot-auswahl-korrektur"></div>
    <button id="tab-abgeben" class="border-b-2 border-brand text-brand"></button>
    <button id="tab-korrigieren" class="hidden border-b-2 border-transparent text-fg-muted"></button>
    <div id="panel-abgeben"></div>
    <div id="panel-korrigieren" class="hidden"></div>
    <form id="gebot-form">
      <input type="radio" name="slot" value="0" checked />
      <div id="betrag-einzel">
        <input type="number" id="betrag" />
        <p id="betrag-richtwert-hinweis"></p>
      </div>
      <div id="betrag-drei" class="hidden">
        <input type="number" id="betrag-min" />
        <input type="number" id="betrag-mittel" />
        <input type="number" id="betrag-max" />
      </div>
      <div id="duplikat-warnung" class="hidden"></div>
      <div id="duplikat-schritt1"></div>
      <div id="duplikat-schritt2" class="hidden"></div>
      <button type="button" id="duplikat-abbrechen"></button>
      <button type="button" id="duplikat-weiter"></button>
      <button type="button" id="duplikat-korrigieren"></button>
      <button type="button" id="duplikat-bestaetigen"></button>
      <button type="submit" id="gebot-btn">Gebot abgeben</button>
    </form>
    <div id="gebot-fehler" class="hidden"></div>
    <button id="korrektur-link-btn"></button>
    <form id="korrektur-form">
      <input type="radio" name="slot-korrektur" value="0" checked />
      <input id="korrektur-emoji" type="text" />
      <div id="korrektur-betrag-einzel">
        <input id="korrektur-betrag" type="number" />
        <p id="korrektur-richtwert-hinweis"></p>
      </div>
      <div id="korrektur-betrag-drei" class="hidden">
        <input type="number" id="korrektur-betrag-min" />
        <input type="number" id="korrektur-betrag-mittel" />
        <input type="number" id="korrektur-betrag-max" />
      </div>
      <p id="korrektur-slot-hinweis"></p>
      <button type="submit" id="korrektur-btn">Gebot ersetzen</button>
    </form>
    <div id="korrektur-fehler" class="hidden"></div>
    <div id="emoji-anzeige"></div>
    <p id="bestaetigung-titel"></p>
    <p id="bestaetigung-text"></p>
  `;
}

async function createEncryptedBlob(overrides?: Partial<{
  rundeName: string;
  gesamtkosten: number;
  dreiGebotModus: boolean;
}>) {
  const partKey = await generatePartKey();
  const { publicKey: adminPubKey } = await generateAdminKeyPair();
  const hmacKey = await generateHmacKey();

  const partKeyB64 = await exportKey(partKey);
  const adminPubKeyB64 = await exportKey(adminPubKey);
  const hmacKeyB64 = await exportKey(hmacKey);

  const blobData = {
    rundeName: overrides?.rundeName ?? 'Testrunde',
    gesamtkosten: overrides?.gesamtkosten ?? 600,
    adminPubKey: adminPubKeyB64,
    hmacKey: hmacKeyB64,
    slots: [{ label: 'Erwachsen', gewichtung: 1.0, anzahl: 1 }],
    dreiGebotModus: overrides?.dreiGebotModus,
  };
  const encTeilnehmerBlob = await encrypt(partKey, JSON.stringify(blobData));
  return { partKeyB64, encTeilnehmerBlob };
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

describe('initGebot', () => {
  beforeEach(() => {
    setupDom();
    vi.stubGlobal('localStorage', makeLocalStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('zeigt Fehler wenn pk-Parameter im Hash fehlt', async () => {
    mockLocation('/runde/abc12345', '');
    vi.stubGlobal('fetch', vi.fn());

    await initGebot();

    expect(document.getElementById('zustand-fehler')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('fehler-text')!.textContent).toContain('Schlüssel');
  });

  it('zeigt Fehler wenn Runde nicht gefunden (fetch 404)', async () => {
    const { partKeyB64 } = await createEncryptedBlob();
    mockLocation('/runde/abc12345', `#pk=${partKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await initGebot();

    expect(document.getElementById('fehler-text')!.textContent).toContain('nicht gefunden');
  });

  it('entschlüsselt Blob und rendert Slots + Rundenname', async () => {
    const { partKeyB64, encTeilnehmerBlob } = await createEncryptedBlob({ rundeName: 'Herbstrunde' });
    mockLocation('/runde/abc12345', `#pk=${partKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob, gebote: [] }),
    }));

    await initGebot();

    expect(document.getElementById('runde-name')!.textContent).toBe('Herbstrunde');
    expect(document.getElementById('slot-auswahl')!.children.length).toBe(1);
    expect(document.getElementById('zustand-formular')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('zustand-laden')!.classList.contains('hidden')).toBe(true);
  });

  it('reicht Gebot ab und zeigt Bestätigung', async () => {
    const { partKeyB64, encTeilnehmerBlob } = await createEncryptedBlob();
    mockLocation('/runde/abc12345', `#pk=${partKeyB64}`);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ encTeilnehmerBlob, gebote: [] }),
      })
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    await initGebot();

    // Betrag eingeben und Formular absenden
    (document.getElementById('betrag') as HTMLInputElement).value = '80';
    document.getElementById('gebot-form')!.dispatchEvent(new Event('submit', { bubbles: true }));

    await vi.waitFor(() => expect(document.getElementById('zustand-bestaetigung')!.classList.contains('hidden')).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, gebotCall] = fetchMock.mock.calls;
    expect(gebotCall[0]).toContain('/gebot');
    expect(gebotCall[1].method).toBe('POST');
  });

  it('zeigt Duplikat-Warnung wenn Slot bereits geboten wurde', async () => {
    const { partKeyB64, encTeilnehmerBlob } = await createEncryptedBlob();
    mockLocation('/runde/abc12345', `#pk=${partKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob, gebote: [] }),
    }));

    // Slot als bereits geboten markieren
    localStorage.setItem('fairshare-slot-abc12345-Erwachsen', '1');

    await initGebot();

    (document.getElementById('betrag') as HTMLInputElement).value = '80';
    document.getElementById('gebot-form')!.dispatchEvent(new Event('submit', { bubbles: true }));

    await vi.waitFor(() => expect(document.getElementById('duplikat-warnung')!.classList.contains('hidden')).toBe(false));
  });

  it('entfernt Fragment aus URL nach dem Laden', async () => {
    const { partKeyB64, encTeilnehmerBlob } = await createEncryptedBlob();
    mockLocation('/runde/abc12345', `#pk=${partKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob, gebote: [] }),
    }));

    await initGebot();

    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/runde/abc12345');
  });

  it('schaltet auf Drei-Felder-UI um wenn dreiGebotModus aktiv ist', async () => {
    const { partKeyB64, encTeilnehmerBlob } = await createEncryptedBlob({ dreiGebotModus: true });
    mockLocation('/runde/abc12345', `#pk=${partKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob, gebote: [] }),
    }));

    await initGebot();

    expect(document.getElementById('betrag-einzel')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('betrag-drei')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('korrektur-betrag-einzel')!.classList.contains('hidden')).toBe(true);
    expect(document.getElementById('korrektur-betrag-drei')!.classList.contains('hidden')).toBe(false);
  });

  it('reicht Drei-Gebot erfolgreich ein', async () => {
    const { partKeyB64, encTeilnehmerBlob } = await createEncryptedBlob({ dreiGebotModus: true });
    mockLocation('/runde/abc12345', `#pk=${partKeyB64}`);
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ encTeilnehmerBlob, gebote: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', mockFetch);

    await initGebot();

    (document.getElementById('betrag-min') as HTMLInputElement).value = '60';
    (document.getElementById('betrag-mittel') as HTMLInputElement).value = '80';
    (document.getElementById('betrag-max') as HTMLInputElement).value = '110';
    document.getElementById('gebot-form')!.dispatchEvent(new Event('submit', { bubbles: true }));

    await vi.waitFor(() => expect(document.getElementById('zustand-bestaetigung')!.classList.contains('hidden')).toBe(false));
    const gebotCall = mockFetch.mock.calls[1];
    const body = JSON.parse(gebotCall[1].body);
    expect(body.encGebot).toBeTruthy();
  });

  it('zeigt Fehler bei fehlenden Drei-Gebot-Feldern', async () => {
    const { partKeyB64, encTeilnehmerBlob } = await createEncryptedBlob({ dreiGebotModus: true });
    mockLocation('/runde/abc12345', `#pk=${partKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob, gebote: [] }),
    }));

    await initGebot();

    // Felder leer lassen → submit
    document.getElementById('gebot-form')!.dispatchEvent(new Event('submit', { bubbles: true }));

    await vi.waitFor(() => expect(document.getElementById('gebot-fehler')!.classList.contains('hidden')).toBe(false));
  });

  it('zeigt Fehler wenn Min > Mittel im Drei-Gebot-Modus', async () => {
    const { partKeyB64, encTeilnehmerBlob } = await createEncryptedBlob({ dreiGebotModus: true });
    mockLocation('/runde/abc12345', `#pk=${partKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob, gebote: [] }),
    }));

    await initGebot();

    (document.getElementById('betrag-min') as HTMLInputElement).value = '100';
    (document.getElementById('betrag-mittel') as HTMLInputElement).value = '50';
    (document.getElementById('betrag-max') as HTMLInputElement).value = '120';
    document.getElementById('gebot-form')!.dispatchEvent(new Event('submit', { bubbles: true }));

    await vi.waitFor(() => {
      const el = document.getElementById('gebot-fehler')!;
      return !el.classList.contains('hidden') && el.textContent?.includes('aufsteigend');
    });
  });

  it('korrigiert Drei-Gebot erfolgreich', async () => {
    const { partKeyB64, encTeilnehmerBlob } = await createEncryptedBlob({ dreiGebotModus: true });
    mockLocation('/runde/abc12345', `#pk=${partKeyB64}`);
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ encTeilnehmerBlob, gebote: [] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', mockFetch);

    await initGebot();

    (document.getElementById('korrektur-emoji') as HTMLInputElement).value = '🦊🌙⭐';
    (document.getElementById('korrektur-betrag-min') as HTMLInputElement).value = '50';
    (document.getElementById('korrektur-betrag-mittel') as HTMLInputElement).value = '80';
    (document.getElementById('korrektur-betrag-max') as HTMLInputElement).value = '120';
    document.getElementById('korrektur-form')!.dispatchEvent(new Event('submit', { bubbles: true }));

    await vi.waitFor(() => expect(document.getElementById('zustand-bestaetigung')!.classList.contains('hidden')).toBe(false));
    const korrekturCall = mockFetch.mock.calls[1];
    const body = JSON.parse(korrekturCall[1].body);
    expect(body.encGebot).toBeTruthy();
    expect(body.isCorrection).toBe(true);
  });

  it('zeigt Korrektur-Fehler wenn Drei-Gebot-Beträge nicht aufsteigend', async () => {
    const { partKeyB64, encTeilnehmerBlob } = await createEncryptedBlob({ dreiGebotModus: true });
    mockLocation('/runde/abc12345', `#pk=${partKeyB64}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ encTeilnehmerBlob, gebote: [] }),
    }));

    await initGebot();

    (document.getElementById('korrektur-emoji') as HTMLInputElement).value = '🦊🌙⭐';
    (document.getElementById('korrektur-betrag-min') as HTMLInputElement).value = '90';
    (document.getElementById('korrektur-betrag-mittel') as HTMLInputElement).value = '50';
    (document.getElementById('korrektur-betrag-max') as HTMLInputElement).value = '120';
    document.getElementById('korrektur-form')!.dispatchEvent(new Event('submit', { bubbles: true }));

    await vi.waitFor(() => {
      const el = document.getElementById('korrektur-fehler')!;
      return !el.classList.contains('hidden') && el.textContent?.includes('aufsteigend');
    });
  });
});
