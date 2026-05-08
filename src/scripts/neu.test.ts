// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initNeu } from './neu';

// ---------------------------------------------------------------------------
// DOM-Skelett
// ---------------------------------------------------------------------------

function setupDom() {
  document.body.innerHTML = `
    <div id="form-bereich"></div>
    <div id="ergebnis-bereich" class="hidden"></div>
    <button id="power-menu-btn" aria-expanded="false"></button>
    <div id="power-menu" class="hidden"></div>
    <button id="splid-import-btn"></button>
    <button id="import-info-btn"></button>
    <div id="import-info-popover" class="hidden"></div>
    <input type="file" id="splid-file" />
    <div id="splid-erfolg" class="hidden"></div>
    <div id="splid-fehler" class="hidden"></div>
    <div id="fehler" class="hidden"></div>
    <input id="teilnehmer-link" type="text" readonly />
    <input id="admin-link" type="text" readonly />
    <a id="teilnehmer-link-oeffnen" href="#"></a>
    <a id="admin-link-oeffnen" href="#"></a>
    <button id="copy-teilnehmer"></button>
    <button id="copy-admin"></button>
    <form id="runde-form">
      <input id="rundeName" name="rundeName" type="text" value="Testrunde" />
      <button type="submit" id="submit-btn">Runde erstellen</button>
      <input id="gesamtkosten" name="gesamtkosten" type="text" value="600" />
      <p id="gesamtkosten-fehler" class="hidden"></p>
    </form>
    <div id="slots-container">
      <div class="slot-eintrag">
        <input type="text" name="label[]" value="" placeholder="Erwachsen" />
        <input type="text" name="ausgaben[]" value="" />
        <div class="ausgaben-inline hidden"></div>
        <input type="radio" class="slot-gewichtung-radio" name="gw-slot-0" value="1.0" checked />
        <input type="radio" class="slot-gewichtung-radio" name="gw-slot-0" value="0.75" />
        <input type="radio" class="slot-gewichtung-radio" name="gw-slot-0" value="0.25" />
        <input type="radio" class="slot-gewichtung-radio" name="gw-slot-0" value="manuell" />
        <input type="text" inputmode="decimal" class="slot-gewichtung-manuell" value="1" readonly />
        <input type="hidden" name="gewichtung[]" value="1" />
        <input type="number" name="anzahl[]" value="1" />
        <input type="checkbox" class="standardgebot-checkbox" />
        <div class="standardgebot-eingabe hidden">
          <input type="text" name="standardgebot[]" data-auto="true" />
        </div>
        <span class="standardgebot-richtwert"></span>
        <details class="slot-erweitert-details"></details>
        <button type="button" class="slot-entfernen hidden"></button>
      </div>
    </div>
    <button id="slot-hinzufuegen"></button>
    <button id="ausgaben-link" aria-expanded="false">+ Ausgaben erfassen</button>
  `;
}

// ---------------------------------------------------------------------------
// localStorage / sessionStorage Mock
// ---------------------------------------------------------------------------

function makeStorageMock() {
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

describe('initNeu', () => {
  beforeEach(() => {
    setupDom();
    vi.stubGlobal('localStorage', makeStorageMock());
    vi.stubGlobal('sessionStorage', makeStorageMock());
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://fairshare.example', pathname: '/neu' },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('erstellt Runde: verschlüsselt Blob und ruft API auf', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'abc12345', adminToken: 'tok1234567890abcd' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    initNeu();

    document.getElementById('runde-form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/runde/erstellen');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    // Blob ist verschlüsselt: Format <iv>.<ciphertext>
    expect(body.encTeilnehmerBlob).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('zeigt Ergebnis-Bereich nach erfolgreichem Erstellen', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'abc12345', adminToken: 'tok1234567890abcd' }),
    }));

    initNeu();
    document.getElementById('runde-form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    await vi.waitFor(() => expect(document.getElementById('ergebnis-bereich')!.classList.contains('hidden')).toBe(false));

    expect(document.getElementById('ergebnis-bereich')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('form-bereich')!.classList.contains('hidden')).toBe(true);
    expect((document.getElementById('teilnehmer-link') as HTMLInputElement).value).toContain('abc12345');
  });

  it('aktualisiert Richtwert-Anzeige bei Gesamtkosten-Eingabe', () => {
    initNeu();

    const gesamtkostenInput = document.getElementById('gesamtkosten') as HTMLInputElement;
    gesamtkostenInput.value = '1000';
    gesamtkostenInput.dispatchEvent(new Event('input', { bubbles: true }));

    const richtwertAnzeige = document.querySelector<HTMLSpanElement>('.standardgebot-richtwert');
    expect(richtwertAnzeige?.textContent).toContain('Richtwert');
  });

  it('öffnet Power-Menü beim Klick auf den Button', () => {
    initNeu();

    document.getElementById('power-menu-btn')!.click();

    expect(document.getElementById('power-menu')!.classList.contains('hidden')).toBe(false);
  });

  it('fügt neuen Slot hinzu', () => {
    initNeu();

    const vorher = document.querySelectorAll('.slot-eintrag').length;
    document.getElementById('slot-hinzufuegen')!.click();
    const nachher = document.querySelectorAll('.slot-eintrag').length;

    expect(nachher).toBe(vorher + 1);
  });

  it('zeigt API-Fehler im Feedback-Element', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Rate limit erreicht' }),
    }));

    initNeu();
    document.getElementById('runde-form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    await vi.waitFor(() => expect(document.getElementById('fehler')!.classList.contains('hidden')).toBe(false));

    expect(document.getElementById('fehler')!.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('fehler')!.textContent).toContain('Rate limit');
  });

  it('normalisiert Komma zu Punkt im Manuell-Gewichtungsfeld', () => {
    initNeu();

    const manuellRadio = document.querySelector<HTMLInputElement>('.slot-gewichtung-radio[value="manuell"]')!;
    manuellRadio.checked = true;
    manuellRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const manuellInput = document.querySelector<HTMLInputElement>('.slot-gewichtung-manuell')!;
    const hiddenInput = document.querySelector<HTMLInputElement>('[name="gewichtung[]"]')!;

    manuellInput.value = '0,25';
    manuellInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect(hiddenInput.value).toBe('0.25');
  });

  it('leert Manuell-Gewichtungsfeld bei ungültiger Eingabe nach Blur', () => {
    initNeu();

    const manuellRadio = document.querySelector<HTMLInputElement>('.slot-gewichtung-radio[value="manuell"]')!;
    manuellRadio.checked = true;
    manuellRadio.dispatchEvent(new Event('change', { bubbles: true }));

    const manuellInput = document.querySelector<HTMLInputElement>('.slot-gewichtung-manuell')!;
    manuellInput.value = 'abc';
    manuellInput.dispatchEvent(new Event('input', { bubbles: true }));
    manuellInput.dispatchEvent(new FocusEvent('blur', { bubbles: true }));

    expect(manuellInput.value).toBe('');
  });

  it('zeigt Fehler bei ungültigen Gesamtkosten (0)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    initNeu();
    (document.getElementById('gesamtkosten') as HTMLInputElement).value = '0';
    document.getElementById('runde-form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    await vi.waitFor(() => expect(document.getElementById('fehler')!.classList.contains('hidden')).toBe(false));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.getElementById('fehler')!.textContent).toContain('Gesamtkosten');
  });

  it('Ja-Pfad: füllt ausgaben vor und macht Ausgaben-Felder sichtbar', () => {
    sessionStorage.setItem('rundeWiederholen', JSON.stringify({
      name: 'Wiederholrunde',
      kosten: 300,
      slots: [{ label: 'Erwachsen', gewichtung: 1, anzahl: 2, ausgaben: 150 }],
    }));

    initNeu();

    const ausgabenInput = document.querySelector<HTMLInputElement>('[name="ausgaben[]"]')!;
    expect(ausgabenInput.value).toBe('150,00');
    expect(document.getElementById('ausgaben-link')!.getAttribute('aria-expanded')).toBe('true');
  });

  it('Nein-Pfad: ausgaben bleibt leer wenn kein ausgaben im Payload', () => {
    sessionStorage.setItem('rundeWiederholen', JSON.stringify({
      name: 'Wiederholrunde',
      kosten: 300,
      slots: [{ label: 'Erwachsen', gewichtung: 1, anzahl: 2 }],
    }));

    initNeu();

    const ausgabenInput = document.querySelector<HTMLInputElement>('[name="ausgaben[]"]')!;
    expect(ausgabenInput.value).toBe('');
    expect(document.getElementById('ausgaben-link')!.getAttribute('aria-expanded')).toBe('false');
  });

  it('berechnet Gesamtkosten live aus Slot-Ausgaben', () => {
    initNeu();

    const ausgabenInput = document.querySelector<HTMLInputElement>('[name="ausgaben[]"]')!;
    ausgabenInput.value = '350';
    ausgabenInput.dispatchEvent(new Event('input', { bubbles: true }));

    expect((document.getElementById('gesamtkosten') as HTMLInputElement).value).toBe('350,00');
  });

  it('blockiert Submit wenn Slot-Summe nicht mit Gesamtkosten übereinstimmt', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    initNeu();

    const ausgabenInput = document.querySelector<HTMLInputElement>('[name="ausgaben[]"]')!;
    ausgabenInput.value = '300';
    ausgabenInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Gesamtkosten manuell auf abweichenden Wert setzen
    (document.getElementById('gesamtkosten') as HTMLInputElement).value = '500';

    document.getElementById('runde-form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    await vi.waitFor(() =>
      expect(document.getElementById('gesamtkosten-fehler')!.classList.contains('hidden')).toBe(false),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.getElementById('gesamtkosten-fehler')!.textContent).toContain('300');
  });

  it('lässt Submit zu wenn keine Ausgaben erfasst sind', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'abc12345', adminToken: 'tok1234567890abcd' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    initNeu();

    // Ausgaben-Feld bleibt leer
    document.getElementById('runde-form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    expect(document.getElementById('gesamtkosten-fehler')!.classList.contains('hidden')).toBe(true);
  });

  it('lässt Submit zu wenn Slot-Summe mit Gesamtkosten übereinstimmt', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'abc12345', adminToken: 'tok1234567890abcd' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    initNeu();

    const ausgabenInput = document.querySelector<HTMLInputElement>('[name="ausgaben[]"]')!;
    ausgabenInput.value = '600';
    ausgabenInput.dispatchEvent(new Event('input', { bubbles: true }));

    document.getElementById('runde-form')!.dispatchEvent(new Event('submit', { bubbles: true }));
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    expect(document.getElementById('gesamtkosten-fehler')!.classList.contains('hidden')).toBe(true);
  });
});
