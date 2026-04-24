import * as XLSX from 'xlsx';
import { parseSplid } from './splid';
import type { SplidImport } from './splid';

export interface ImportSlot {
  name: string;
  ausgaben: number;
  gewichtung: number;
  anzahl: number;
  standardgebot?: number;
}

export type DetectedImport =
  | { format: 'splid'; rundenname: string; gesamtkosten: number; slots: ImportSlot[] }
  | { format: 'basis'; gesamtkosten: number; slots: ImportSlot[] };

const PFLICHTFELDER = ['name', 'ausgaben', 'gewichtung', 'anzahl'] as const;

function normalisiereKopf(val: unknown): string {
  return String(val).trim().toLowerCase();
}

export function parseBasisImport(buffer: ArrayBuffer): { gesamtkosten: number; slots: ImportSlot[] } {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('Die Datei enthält keine Tabelle.');

  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) throw new Error('Die Tabelle enthält keine Datenzeilen.');

  const headerRow = rows[0].map(normalisiereKopf);

  for (const pflicht of PFLICHTFELDER) {
    if (!headerRow.includes(pflicht)) {
      const original = pflicht.charAt(0).toUpperCase() + pflicht.slice(1);
      throw new Error(`Pflichtspalte „${original}" fehlt in der Tabelle.`);
    }
  }

  const idx = {
    name: headerRow.indexOf('name'),
    ausgaben: headerRow.indexOf('ausgaben'),
    gewichtung: headerRow.indexOf('gewichtung'),
    anzahl: headerRow.indexOf('anzahl'),
    standardgebot: headerRow.indexOf('standardgebot'),
  };

  const slots: ImportSlot[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = String(row[idx.name] ?? '').trim();
    if (!name) continue;

    const ausgaben = Number(row[idx.ausgaben]);
    if (!isFinite(ausgaben)) continue;

    const gewichtung = Number(row[idx.gewichtung]);
    if (!isFinite(gewichtung) || gewichtung <= 0) continue;

    const anzahl = Number(row[idx.anzahl]);
    if (!isFinite(anzahl) || anzahl < 1) continue;

    const slot: ImportSlot = {
      name,
      ausgaben: Math.round(ausgaben * 100) / 100,
      gewichtung: Math.round(gewichtung * 1000) / 1000,
      anzahl: Math.round(anzahl),
    };

    if (idx.standardgebot >= 0) {
      const std = Number(row[idx.standardgebot]);
      if (isFinite(std) && std > 0) slot.standardgebot = Math.round(std * 100) / 100;
    }

    slots.push(slot);
  }

  if (slots.length === 0) throw new Error('Keine gültigen Zeilen gefunden. Prüfe Name, Ausgaben, Gewichtung und Anzahl.');

  const gesamtkosten = Math.round(slots.reduce((s, sl) => s + sl.ausgaben, 0) * 100) / 100;
  return { gesamtkosten, slots };
}

function splidZuSlots(splid: SplidImport): ImportSlot[] {
  return splid.personen.map((p) => ({
    name: p.name,
    ausgaben: p.ausgaben,
    gewichtung: 1,
    anzahl: 1,
  }));
}

export async function detectAndParse(buffer: ArrayBuffer, filename: string): Promise<DetectedImport> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'xls') {
    const data = await parseSplid(buffer);
    return { format: 'splid', rundenname: data.rundenname, gesamtkosten: data.gesamtkosten, slots: splidZuSlots(data) };
  }

  if (ext === 'xlsx') {
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });
    if (wb.SheetNames.includes('Zusammenfassung')) {
      const data = await parseSplid(buffer);
      return { format: 'splid', rundenname: data.rundenname, gesamtkosten: data.gesamtkosten, slots: splidZuSlots(data) };
    }
    const result = parseBasisImport(buffer);
    return { format: 'basis', ...result };
  }

  if (ext === 'csv') {
    const result = parseBasisImport(buffer);
    return { format: 'basis', ...result };
  }

  throw new Error(`Unbekanntes Dateiformat „.${ext}". Unterstützt werden: .csv, .xlsx, .xls`);
}
