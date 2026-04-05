/**
 * Tests für src/lib/splid.ts
 *
 * Synthetische XLSX-Buffer werden mit SheetJS erstellt —
 * kein echtes Splid-File als Fixture nötig.
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSplid, type SplidImport } from './splid';

// ---------------------------------------------------------------------------
// Hilfsfunktion: baut einen minimalen Splid-XLSX-Buffer
// ---------------------------------------------------------------------------

function buildSplidBuffer(opts: {
  rundenname?: string;
  personen: string[];
  ausgaben: { von: string; betrag: number }[];
}): ArrayBuffer {
  const { rundenname = 'Test-Runde', personen, ausgaben } = opts;

  // Kopfzeile: Titel, Betrag, Währung, Von, Datum, Erstellt am, [Person, Calc, ...]
  const headerRow: unknown[] = ['Titel', 'Betrag', 'Währung', 'Von', 'Datum', 'Erstellt am'];
  for (const p of personen) {
    headerRow.push(p);
    headerRow.push(''); // Berechnungsspalte
  }

  // Datenzeilen
  const dataRows = ausgaben.map(({ von, betrag }) => [
    'Einkauf', betrag, 'EUR', von, '01.01.26', '01.01.26',
  ]);

  const aoa: unknown[][] = [
    [rundenname],
    ['Erstellt mit Splid (splid.app)'],
    [],
    headerRow,
    ...dataRows,
  ];

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Zusammenfassung');

  // XLSX.write mit type:'array' gibt in Node.js ein plain Array zurück, kein TypedArray
  const xlsxArray = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[];
  return new Uint8Array(xlsxArray).buffer as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseSplid', () => {
  it('extrahiert Rundenname, Gesamtkosten und Personenliste', () => {
    const buf = buildSplidBuffer({
      rundenname: 'Haushaltskasse Februar',
      personen: ['Anna', 'Ben', 'Cara'],
      ausgaben: [
        { von: 'Anna', betrag: 100 },
        { von: 'Ben', betrag: 50 },
        { von: 'Anna', betrag: 25 },
      ],
    });

    const result: SplidImport = parseSplid(buf);

    expect(result.rundenname).toBe('Haushaltskasse Februar');
    expect(result.gesamtkosten).toBe(175);
    expect(result.personen.map((p) => p.name)).toEqual(['Anna', 'Ben', 'Cara']);
  });

  it('berechnet Ausgaben pro Person korrekt', () => {
    const buf = buildSplidBuffer({
      personen: ['Anna', 'Ben'],
      ausgaben: [
        { von: 'Anna', betrag: 30 },
        { von: 'Anna', betrag: 20.5 },
        { von: 'Ben', betrag: 10 },
      ],
    });

    const { personen } = parseSplid(buf);
    const anna = personen.find((p) => p.name === 'Anna')!;
    const ben = personen.find((p) => p.name === 'Ben')!;

    expect(anna.ausgaben).toBeCloseTo(50.5, 2);
    expect(ben.ausgaben).toBeCloseTo(10, 2);
  });

  it('setzt ausgaben auf 0 für Personen ohne eigene Ausgaben (Laura-Fall)', () => {
    const buf = buildSplidBuffer({
      personen: ['Laura', 'Stefan'],
      ausgaben: [
        { von: 'Stefan', betrag: 80 },
      ],
    });

    const { personen } = parseSplid(buf);
    const laura = personen.find((p) => p.name === 'Laura')!;

    expect(laura.ausgaben).toBe(0);
  });

  it('rundet Gesamtkosten und Ausgaben auf 2 Dezimalstellen', () => {
    const buf = buildSplidBuffer({
      personen: ['Anna'],
      ausgaben: [
        { von: 'Anna', betrag: 1 / 3 },
        { von: 'Anna', betrag: 2 / 3 },
      ],
    });

    const { gesamtkosten, personen } = parseSplid(buf);

    expect(gesamtkosten).toBe(1);
    expect(personen[0].ausgaben).toBe(1);
  });

  it('wirft wenn Sheet „Zusammenfassung" fehlt', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Daten']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Anderes Sheet');
    const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[];
    const buf = new Uint8Array(arr).buffer as ArrayBuffer;

    expect(() => parseSplid(buf)).toThrow('Zusammenfassung');
  });

  it('wirft wenn Kopfzeile fehlt', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Titel'], ['Daten']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Zusammenfassung');
    const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[];
    const buf = new Uint8Array(arr).buffer as ArrayBuffer;

    expect(() => parseSplid(buf)).toThrow('Kopfzeile');
  });

  it('wirft wenn keine Personen erkannt werden', () => {
    // Kopfzeile mit Von + Betrag, aber ohne Personenspalten
    const ws = XLSX.utils.aoa_to_sheet([
      ['Runde'],
      [],
      [],
      ['Titel', 'Betrag', 'Währung', 'Von', 'Datum', 'Erstellt am'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Zusammenfassung');
    const arr = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as number[];
    const buf = new Uint8Array(arr).buffer as ArrayBuffer;

    expect(() => parseSplid(buf)).toThrow('Teilnehmer');
  });
});
