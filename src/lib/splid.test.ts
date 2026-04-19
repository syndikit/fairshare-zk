/**
 * Tests für src/lib/splid.ts
 *
 * Synthetische Buffer werden mit SheetJS erstellt —
 * kein echtes Splid-File als Fixture nötig.
 */

import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSplid, type SplidImport } from './splid';

// ---------------------------------------------------------------------------
// Hilfsfunktion: baut einen minimalen Splid-Buffer
// ---------------------------------------------------------------------------

function buildSplidBuffer(opts: {
  rundenname?: string;
  personen: string[];
  ausgaben: { von: string; betrag: number }[];
  bookType?: XLSX.BookType;
}): ArrayBuffer {
  const { rundenname = 'Test-Runde', personen, ausgaben, bookType = 'xlsx' } = opts;

  const rows: unknown[][] = [
    [rundenname],
    ['Erstellt mit Splid (splid.app)'],
    [],
    ['Titel', 'Betrag', 'Währung', 'Von', 'Datum', 'Erstellt am', ...personen.flatMap((p) => [p, ''])],
    ...ausgaben.map(({ von, betrag }) => ['Einkauf', betrag, 'EUR', von, '01.01.26', '01.01.26']),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Zusammenfassung');

  const buf = XLSX.write(wb, { type: 'buffer', bookType }) as Buffer;
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseSplid', () => {
  it('extrahiert Rundenname, Gesamtkosten und Personenliste', async () => {
    const buf = buildSplidBuffer({
      rundenname: 'Haushaltskasse Februar',
      personen: ['Anna', 'Ben', 'Cara'],
      ausgaben: [
        { von: 'Anna', betrag: 100 },
        { von: 'Ben', betrag: 50 },
        { von: 'Anna', betrag: 25 },
      ],
    });

    const result: SplidImport = await parseSplid(buf);

    expect(result.rundenname).toBe('Haushaltskasse Februar');
    expect(result.gesamtkosten).toBe(175);
    expect(result.personen.map((p) => p.name)).toEqual(['Anna', 'Ben', 'Cara']);
  });

  it('berechnet Ausgaben pro Person korrekt', async () => {
    const buf = buildSplidBuffer({
      personen: ['Anna', 'Ben'],
      ausgaben: [
        { von: 'Anna', betrag: 30 },
        { von: 'Anna', betrag: 20.5 },
        { von: 'Ben', betrag: 10 },
      ],
    });

    const { personen } = await parseSplid(buf);
    const anna = personen.find((p) => p.name === 'Anna')!;
    const ben = personen.find((p) => p.name === 'Ben')!;

    expect(anna.ausgaben).toBeCloseTo(50.5, 2);
    expect(ben.ausgaben).toBeCloseTo(10, 2);
  });

  it('setzt ausgaben auf 0 für Personen ohne eigene Ausgaben (Laura-Fall)', async () => {
    const buf = buildSplidBuffer({
      personen: ['Laura', 'Stefan'],
      ausgaben: [{ von: 'Stefan', betrag: 80 }],
    });

    const { personen } = await parseSplid(buf);
    const laura = personen.find((p) => p.name === 'Laura')!;

    expect(laura.ausgaben).toBe(0);
  });

  it('rundet Gesamtkosten und Ausgaben auf 2 Dezimalstellen', async () => {
    const buf = buildSplidBuffer({
      personen: ['Anna'],
      ausgaben: [
        { von: 'Anna', betrag: 1 / 3 },
        { von: 'Anna', betrag: 2 / 3 },
      ],
    });

    const { gesamtkosten, personen } = await parseSplid(buf);

    expect(gesamtkosten).toBe(1);
    expect(personen[0].ausgaben).toBe(1);
  });

  it('liest .xls-Buffer (Excel 97-2003)', async () => {
    const buf = buildSplidBuffer({
      rundenname: 'XLS-Runde',
      personen: ['Anna', 'Ben'],
      ausgaben: [
        { von: 'Anna', betrag: 60 },
        { von: 'Ben', betrag: 40 },
      ],
      bookType: 'xls',
    });

    const result = await parseSplid(buf);

    expect(result.rundenname).toBe('XLS-Runde');
    expect(result.gesamtkosten).toBe(100);
    expect(result.personen.map((p) => p.name)).toEqual(['Anna', 'Ben']);
  });

  it('wirft wenn Sheet „Zusammenfassung" fehlt', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['Daten']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Anderes Sheet');
    const nodeBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const buf = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength) as ArrayBuffer;

    await expect(parseSplid(buf)).rejects.toThrow('Zusammenfassung');
  });

  it('wirft wenn Kopfzeile fehlt', async () => {
    const ws = XLSX.utils.aoa_to_sheet([['Nur ein Titel'], ['Daten ohne Kopfzeile']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Zusammenfassung');
    const nodeBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const buf = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength) as ArrayBuffer;

    await expect(parseSplid(buf)).rejects.toThrow('Kopfzeile');
  });

  it('wirft wenn keine Personen erkannt werden', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Runde'],
      [],
      [],
      ['Titel', 'Betrag', 'Währung', 'Von', 'Datum', 'Erstellt am'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Zusammenfassung');
    const nodeBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const buf = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength) as ArrayBuffer;

    await expect(parseSplid(buf)).rejects.toThrow('Teilnehmer');
  });
});
