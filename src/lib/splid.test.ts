/**
 * Tests für src/lib/splid.ts
 *
 * Synthetische XLSX-Buffer werden mit ExcelJS erstellt —
 * kein echtes Splid-File als Fixture nötig.
 */

import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseSplid, type SplidImport } from './splid';

// ---------------------------------------------------------------------------
// Hilfsfunktion: baut einen minimalen Splid-XLSX-Buffer
// ---------------------------------------------------------------------------

async function buildSplidBuffer(opts: {
  rundenname?: string;
  personen: string[];
  ausgaben: { von: string; betrag: number }[];
}): Promise<ArrayBuffer> {
  const { rundenname = 'Test-Runde', personen, ausgaben } = opts;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Zusammenfassung');

  // Zeile 1: Rundenname
  ws.addRow([rundenname]);
  // Zeile 2: Splid-Hinweis
  ws.addRow(['Erstellt mit Splid (splid.app)']);
  // Zeile 3: leer
  ws.addRow([]);
  // Zeile 4: Kopfzeile
  const headerRow = ['Titel', 'Betrag', 'Währung', 'Von', 'Datum', 'Erstellt am'];
  for (const p of personen) {
    headerRow.push(p);
    headerRow.push(''); // Berechnungsspalte
  }
  ws.addRow(headerRow);
  // Zeile 5+: Ausgaben
  for (const { von, betrag } of ausgaben) {
    ws.addRow(['Einkauf', betrag, 'EUR', von, '01.01.26', '01.01.26']);
  }

  // writeBuffer() gibt in Node.js einen Buffer zurück
  const nodeBuf = await wb.xlsx.writeBuffer() as Buffer;
  // Buffer → eigener ArrayBuffer ohne Pool-Offset
  return nodeBuf.buffer.slice(
    nodeBuf.byteOffset,
    nodeBuf.byteOffset + nodeBuf.byteLength,
  ) as ArrayBuffer;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseSplid', () => {
  it('extrahiert Rundenname, Gesamtkosten und Personenliste', async () => {
    const buf = await buildSplidBuffer({
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
    const buf = await buildSplidBuffer({
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
    const buf = await buildSplidBuffer({
      personen: ['Laura', 'Stefan'],
      ausgaben: [{ von: 'Stefan', betrag: 80 }],
    });

    const { personen } = await parseSplid(buf);
    const laura = personen.find((p) => p.name === 'Laura')!;

    expect(laura.ausgaben).toBe(0);
  });

  it('rundet Gesamtkosten und Ausgaben auf 2 Dezimalstellen', async () => {
    const buf = await buildSplidBuffer({
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

  it('wirft wenn Sheet „Zusammenfassung" fehlt', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Anderes Sheet').addRow(['Daten']);
    const nodeBuf = await wb.xlsx.writeBuffer() as Buffer;
    const buf = nodeBuf.buffer.slice(
      nodeBuf.byteOffset,
      nodeBuf.byteOffset + nodeBuf.byteLength,
    ) as ArrayBuffer;

    await expect(parseSplid(buf)).rejects.toThrow('Zusammenfassung');
  });

  it('wirft wenn Kopfzeile fehlt', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Zusammenfassung');
    ws.addRow(['Nur ein Titel']);
    ws.addRow(['Daten ohne Kopfzeile']);
    const nodeBuf = await wb.xlsx.writeBuffer() as Buffer;
    const buf = nodeBuf.buffer.slice(
      nodeBuf.byteOffset,
      nodeBuf.byteOffset + nodeBuf.byteLength,
    ) as ArrayBuffer;

    await expect(parseSplid(buf)).rejects.toThrow('Kopfzeile');
  });

  it('wirft wenn keine Personen erkannt werden', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Zusammenfassung');
    ws.addRow(['Runde']);
    ws.addRow([]);
    ws.addRow([]);
    // Kopfzeile ohne Personenspalten
    ws.addRow(['Titel', 'Betrag', 'Währung', 'Von', 'Datum', 'Erstellt am']);
    const nodeBuf = await wb.xlsx.writeBuffer() as Buffer;
    const buf = nodeBuf.buffer.slice(
      nodeBuf.byteOffset,
      nodeBuf.byteOffset + nodeBuf.byteLength,
    ) as ArrayBuffer;

    await expect(parseSplid(buf)).rejects.toThrow('Teilnehmer');
  });
});
