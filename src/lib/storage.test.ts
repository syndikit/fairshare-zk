import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getRunden,
  saveRunde,
  deleteRunde,
  clearRunden,
  saveGebotLokal,
  getGebotSlot,
  exportJson,
  importJson,
  type LocalRunde,
} from './storage';

// ---------------------------------------------------------------------------
// localStorage-Stub
// ---------------------------------------------------------------------------

function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => store.clear()),
    store,
  };
}

let ls: ReturnType<typeof makeLocalStorageStub>;

beforeEach(() => {
  ls = makeLocalStorageStub();
  vi.stubGlobal('localStorage', ls);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Hilfsfunktion
// ---------------------------------------------------------------------------

function runde(overrides: Partial<LocalRunde> = {}): LocalRunde {
  return {
    id: 'abc12345',
    name: 'Testrunde',
    hinzugefuegtAm: '2026-04-21T00:00:00.000Z',
    teilnehmerLink: 'https://example.com/runde/abc12345#pk=x',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// getRunden
// ---------------------------------------------------------------------------

describe('getRunden', () => {
  it('gibt [] zurück wenn kein Eintrag vorhanden', () => {
    expect(getRunden()).toEqual([]);
  });

  it('gibt geparste Runden zurück bei validem JSON', () => {
    const r = runde();
    ls.store.set('fairshare_runden', JSON.stringify([r]));
    expect(getRunden()).toEqual([r]);
  });

  it('wirft bei korruptem JSON', () => {
    ls.store.set('fairshare_runden', '{kaputt}');
    expect(() => getRunden()).toThrow();
  });

  it('wirft wenn JSON kein Array ist', () => {
    ls.store.set('fairshare_runden', JSON.stringify({ nicht: 'array' }));
    expect(() => getRunden()).toThrow('Ungültiges Format in localStorage');
  });
});

// ---------------------------------------------------------------------------
// saveRunde
// ---------------------------------------------------------------------------

describe('saveRunde', () => {
  it('fügt neue Runde hinzu', () => {
    const r = runde();
    saveRunde(r);
    expect(getRunden()).toEqual([r]);
  });

  it('überschreibt nicht wenn bestehender Eintrag adminLink hat (kein Downgrade)', () => {
    const mitAdmin = runde({ adminLink: 'https://example.com/admin' });
    saveRunde(mitAdmin);
    const ohneAdmin = runde({ adminLink: undefined });
    saveRunde(ohneAdmin);
    expect(getRunden()[0].adminLink).toBe('https://example.com/admin');
  });

  it('überschreibt wenn bestehender Eintrag keinen adminLink hat (Upgrade)', () => {
    const ohneAdmin = runde({ adminLink: undefined });
    saveRunde(ohneAdmin);
    const mitAdmin = runde({ adminLink: 'https://example.com/admin' });
    saveRunde(mitAdmin);
    expect(getRunden()[0].adminLink).toBe('https://example.com/admin');
  });

  it('überschreibt nicht wenn beide keinen adminLink haben', () => {
    const r1 = runde({ name: 'Original', adminLink: undefined });
    saveRunde(r1);
    const r2 = runde({ name: 'Update', adminLink: undefined });
    saveRunde(r2);
    expect(getRunden()[0].name).toBe('Original');
  });

  it('überschreibt nicht wenn beide adminLink haben', () => {
    const r1 = runde({ name: 'Original', adminLink: 'https://example.com/admin1' });
    saveRunde(r1);
    const r2 = runde({ name: 'Update', adminLink: 'https://example.com/admin2' });
    saveRunde(r2);
    expect(getRunden()[0].adminLink).toBe('https://example.com/admin1');
  });
});

// ---------------------------------------------------------------------------
// deleteRunde
// ---------------------------------------------------------------------------

describe('deleteRunde', () => {
  it('entfernt Runde per ID', () => {
    saveRunde(runde({ id: 'aaa' }));
    saveRunde(runde({ id: 'bbb' }));
    deleteRunde('aaa');
    const ids = getRunden().map((r) => r.id);
    expect(ids).toEqual(['bbb']);
  });

  it('tut nichts bei unbekannter ID', () => {
    saveRunde(runde({ id: 'aaa' }));
    deleteRunde('zzz');
    expect(getRunden()).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// clearRunden
// ---------------------------------------------------------------------------

describe('clearRunden', () => {
  it('löscht alle Runden aus localStorage', () => {
    saveRunde(runde({ id: 'aaa' }));
    saveRunde(runde({ id: 'bbb' }));
    clearRunden();
    expect(getRunden()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// saveGebotLokal / getGebotSlot
// ---------------------------------------------------------------------------

describe('saveGebotLokal / getGebotSlot', () => {
  it('Roundtrip: gespeichertes Gebot wird korrekt zurückgegeben', () => {
    saveGebotLokal('runde1', '🐼🚀🌈', 'Erwachsen');
    expect(getGebotSlot('runde1', '🐼🚀🌈')).toBe('Erwachsen');
  });

  it('gibt null zurück wenn kein Gebot vorhanden', () => {
    expect(getGebotSlot('runde1', '🐼🚀🌈')).toBeNull();
  });

  it('doppeltes Speichern derselben emojiId wird ignoriert', () => {
    saveGebotLokal('runde1', '🐼🚀🌈', 'Erwachsen');
    saveGebotLokal('runde1', '🐼🚀🌈', 'Kind');
    const raw = ls.store.get('fairshare-gebot-runde1')!;
    expect(JSON.parse(raw)).toHaveLength(1);
    expect(getGebotSlot('runde1', '🐼🚀🌈')).toBe('Erwachsen');
  });

  it('verschiedene rundenIds sind unabhängig', () => {
    saveGebotLokal('runde1', '🐼🚀🌈', 'SlotA');
    saveGebotLokal('runde2', '🐼🚀🌈', 'SlotB');
    expect(getGebotSlot('runde1', '🐼🚀🌈')).toBe('SlotA');
    expect(getGebotSlot('runde2', '🐼🚀🌈')).toBe('SlotB');
  });
});

// ---------------------------------------------------------------------------
// exportJson
// ---------------------------------------------------------------------------

describe('exportJson', () => {
  it('gibt leeres Array als JSON zurück wenn keine Runden vorhanden', () => {
    expect(exportJson()).toBe('[]');
  });

  it('serialisiert vorhandene Runden als formatiertes JSON', () => {
    const r = runde();
    saveRunde(r);
    const parsed = JSON.parse(exportJson());
    expect(parsed).toEqual([r]);
  });
});

// ---------------------------------------------------------------------------
// importJson
// ---------------------------------------------------------------------------

describe('importJson', () => {
  it('importiert valide Runden', () => {
    const r = runde();
    importJson(JSON.stringify([r]));
    expect(getRunden()).toEqual([r]);
  });

  it('wirft bei ungültigem JSON', () => {
    expect(() => importJson('{kaputt}')).toThrow();
  });

  it('wirft wenn JSON kein Array ist', () => {
    expect(() => importJson(JSON.stringify({ nicht: 'array' }))).toThrow('Ungültiges Format: kein Array');
  });

  it('wirft wenn Einträge Pflichtfelder fehlen', () => {
    expect(() => importJson(JSON.stringify([{ id: 'abc' }]))).toThrow('Pflichtfelder');
  });

  it('überschreibt bestehende Runden komplett', () => {
    saveRunde(runde({ id: 'alt' }));
    importJson(JSON.stringify([runde({ id: 'neu' })]));
    const ids = getRunden().map((r) => r.id);
    expect(ids).toEqual(['neu']);
  });
});
