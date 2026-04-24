import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBasisImport, detectAndParse } from './basis-import';

// ---------------------------------------------------------------------------
// Hilfsfunktionen zum Erstellen von Test-Buffern
// ---------------------------------------------------------------------------

function makeXlsxBuffer(rows: unknown[][], sheetName = 'Tabelle1'): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return buf;
}

function makeCsvBuffer(rows: unknown[][]): ArrayBuffer {
  const csv = rows.map((r) => r.join(',')).join('\n');
  return new TextEncoder().encode(csv).buffer;
}

const BASIS_HEADER = ['Name', 'Ausgaben', 'Gewichtung', 'Anzahl'];
const BASIS_HEADER_MIT_STD = [...BASIS_HEADER, 'Standardgebot'];

// ---------------------------------------------------------------------------
// parseBasisImport
// ---------------------------------------------------------------------------

describe('parseBasisImport', () => {
  it('parst XLSX korrekt (alle Pflichtfelder)', () => {
    const buf = makeXlsxBuffer([
      BASIS_HEADER,
      ['Erwachsene', 180, 1.0, 3],
      ['Kinder', 60, 0.5, 2],
    ]);
    const result = parseBasisImport(buf);
    expect(result.slots).toHaveLength(2);
    expect(result.slots[0]).toEqual({ name: 'Erwachsene', ausgaben: 180, gewichtung: 1, anzahl: 3 });
    expect(result.slots[1]).toEqual({ name: 'Kinder', ausgaben: 60, gewichtung: 0.5, anzahl: 2 });
    expect(result.gesamtkosten).toBe(240);
  });

  it('parst CSV korrekt', () => {
    const buf = makeCsvBuffer([
      BASIS_HEADER,
      ['Erwachsene', '180.00', '1.0', '3'],
    ]);
    const result = parseBasisImport(buf);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].name).toBe('Erwachsene');
    expect(result.slots[0].ausgaben).toBe(180);
  });

  it('parst optionales Standardgebot', () => {
    const buf = makeXlsxBuffer([
      BASIS_HEADER_MIT_STD,
      ['Erwachsene', 180, 1.0, 3, ''],
      ['Kinder', 60, 0.5, 2, 30],
    ]);
    const result = parseBasisImport(buf);
    expect(result.slots[0].standardgebot).toBeUndefined();
    expect(result.slots[1].standardgebot).toBe(30);
  });

  it('behandelt Spaltenköpfe case-insensitiv', () => {
    const buf = makeXlsxBuffer([
      ['NAME', 'AUSGABEN', 'GEWICHTUNG', 'ANZAHL'],
      ['Test', 100, 1.0, 1],
    ]);
    const result = parseBasisImport(buf);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].name).toBe('Test');
  });

  it('wirft Fehler bei fehlender Pflichtspalte', () => {
    const buf = makeXlsxBuffer([
      ['Name', 'Ausgaben', 'Gewichtung'], // Anzahl fehlt
      ['Test', 100, 1.0],
    ]);
    expect(() => parseBasisImport(buf)).toThrow('Pflichtspalte „Anzahl" fehlt');
  });

  it('überspringt Zeilen mit leerem Name', () => {
    const buf = makeXlsxBuffer([
      BASIS_HEADER,
      ['', 100, 1.0, 1],
      ['Gültig', 50, 1.0, 1],
    ]);
    const result = parseBasisImport(buf);
    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].name).toBe('Gültig');
  });

  it('überspringt Zeilen mit nicht-numerischem Betrag', () => {
    const buf = makeXlsxBuffer([
      BASIS_HEADER,
      ['Test', 'abc', 1.0, 1],
      ['Gültig', 50, 1.0, 1],
    ]);
    const result = parseBasisImport(buf);
    expect(result.slots).toHaveLength(1);
  });

  it('überspringt Zeilen mit nicht-numerischer Gewichtung', () => {
    const buf = makeXlsxBuffer([
      BASIS_HEADER,
      ['Test', 100, 'xyz', 1],
      ['Gültig', 50, 1.0, 1],
    ]);
    const result = parseBasisImport(buf);
    expect(result.slots).toHaveLength(1);
  });

  it('summiert gesamtkosten korrekt aus Ausgaben', () => {
    const buf = makeXlsxBuffer([
      BASIS_HEADER,
      ['A', 100.50, 1.0, 1],
      ['B', 49.50, 1.0, 1],
    ]);
    const result = parseBasisImport(buf);
    expect(result.gesamtkosten).toBe(150);
  });

  it('wirft Fehler wenn keine gültigen Zeilen vorhanden', () => {
    const buf = makeXlsxBuffer([
      BASIS_HEADER,
      ['', 100, 1.0, 1], // leer → übersprungen
    ]);
    expect(() => parseBasisImport(buf)).toThrow('Keine gültigen Zeilen');
  });

  it('wirft Fehler bei leerer Tabelle (nur Header)', () => {
    const buf = makeXlsxBuffer([BASIS_HEADER]);
    expect(() => parseBasisImport(buf)).toThrow('keine Datenzeilen');
  });
});

// ---------------------------------------------------------------------------
// detectAndParse
// ---------------------------------------------------------------------------

describe('detectAndParse', () => {
  it('routet .csv zu Basis-Import', async () => {
    const buf = makeCsvBuffer([
      BASIS_HEADER,
      ['Erwachsene', '180', '1.0', '2'],
    ]);
    const result = await detectAndParse(buf, 'kosten.csv');
    expect(result.format).toBe('basis');
    expect(result.slots).toHaveLength(1);
  });

  it('routet .xlsx ohne Zusammenfassung-Sheet zu Basis-Import', async () => {
    const buf = makeXlsxBuffer([
      BASIS_HEADER,
      ['Erwachsene', 180, 1.0, 3],
    ], 'Tabelle1');
    const result = await detectAndParse(buf, 'kosten.xlsx');
    expect(result.format).toBe('basis');
  });

  it('routet .xlsx mit Zusammenfassung-Sheet zu Splid', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Meine Runde'],
      [],
      ['Von', 'An', 'Betrag', 'Erstellt am', 'Datum', 'Beschreibung', 'Alice', '', 'Bob', ''],
      ['Alice', 'Bob', 100, '2024-01-01', '', '', 100, 0, 0, 0],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Zusammenfassung');
    const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const result = await detectAndParse(buf, 'splid.xlsx');
    expect(result.format).toBe('splid');
    if (result.format === 'splid') {
      expect(result.rundenname).toBe('Meine Runde');
      expect(result.slots[0].gewichtung).toBe(1);
      expect(result.slots[0].anzahl).toBe(1);
    }
  });

  it('wirft Fehler bei unbekanntem Dateiformat', async () => {
    const buf = new ArrayBuffer(0);
    await expect(detectAndParse(buf, 'datei.pdf')).rejects.toThrow('Unbekanntes Dateiformat');
  });

  it('gibt bei Splid-Import slots mit gewichtung=1 und anzahl=1 zurück', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Gruppenreise'],
      [],
      ['Von', 'An', 'Betrag', 'Erstellt am', 'Datum', 'Beschreibung', 'Alice', '', 'Bob', ''],
      ['Alice', 'Bob', 50, '', '', '', 50, 0, 0, 0],
      ['Bob', 'Alice', 30, '', '', '', 0, 0, 30, 0],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Zusammenfassung');
    const buf: ArrayBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const result = await detectAndParse(buf, 'trip.xlsx');
    expect(result.format).toBe('splid');
    if (result.format === 'splid') {
      result.slots.forEach((s) => {
        expect(s.gewichtung).toBe(1);
        expect(s.anzahl).toBe(1);
      });
    }
  });
});
