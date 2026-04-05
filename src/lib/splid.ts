/**
 * FairShare ZK — Splid-Import
 *
 * Liest eine Splid-XLSX-Exportdatei (Sheet "Zusammenfassung") im Browser
 * und extrahiert Rundenname, Gesamtkosten und Teilnehmer mit ihren Ausgaben.
 * Die Datei verlässt dabei das Gerät nicht.
 */

import * as XLSX from 'xlsx';

export interface SplidPerson {
  name: string;
  ausgaben: number;
}

export interface SplidImport {
  rundenname: string;
  gesamtkosten: number;
  personen: SplidPerson[];
}

/**
 * Parst einen ArrayBuffer einer Splid-XLSX-Datei.
 * Wirft bei ungültigem Format mit einer verständlichen Fehlermeldung.
 */
export function parseSplid(buffer: ArrayBuffer): SplidImport {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });

  const SHEET = 'Zusammenfassung';
  if (!wb.SheetNames.includes(SHEET)) {
    throw new Error(
      'Datei enthält kein Sheet „Zusammenfassung". Bitte einen Splid-Export verwenden.',
    );
  }

  const ws = wb.Sheets[SHEET];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });

  // Rundenname aus A1
  const rundenname = String((rows[0] as unknown[])?.[0] ?? '').trim();
  if (!rundenname) {
    throw new Error('Rundenname nicht gefunden (Zelle A1 ist leer).');
  }

  // Kopfzeile finden: erste Zeile mit beiden Spalten "Von" und "Betrag"
  let headerRowIdx = -1;
  let vonIdx = -1;
  let betragIdx = -1;
  let personenStartCol = 6; // Fallback: nach den 6 Standard-Spalten

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const vonI = row.findIndex((c) => String(c ?? '').trim() === 'Von');
    const betragI = row.findIndex((c) => String(c ?? '').trim() === 'Betrag');
    if (vonI !== -1 && betragI !== -1) {
      headerRowIdx = i;
      vonIdx = vonI;
      betragIdx = betragI;
      // Personenspalten beginnen nach "Erstellt am" (oder nach Position 5)
      const erstelltAmI = row.findIndex((c) => String(c ?? '').trim() === 'Erstellt am');
      personenStartCol = erstelltAmI !== -1 ? erstelltAmI + 1 : 6;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      'Kopfzeile nicht gefunden. Erwartet werden Spalten „Von" und „Betrag".',
    );
  }

  // Personennamen aus Kopfzeile extrahieren (ungerade Spalten ab personenStartCol)
  const headerRow = rows[headerRowIdx] as unknown[];
  const personenNamen: string[] = [];
  for (let col = personenStartCol; col < headerRow.length; col += 2) {
    const name = String(headerRow[col] ?? '').trim();
    if (name) personenNamen.push(name);
  }

  if (personenNamen.length === 0) {
    throw new Error(
      'Keine Teilnehmer gefunden. Bitte einen vollständigen Splid-Export verwenden.',
    );
  }

  // Ausgaben pro Person summieren + Gesamtkosten berechnen
  const ausgabenMap = new Map<string, number>(personenNamen.map((n) => [n, 0]));
  let gesamtkosten = 0;

  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    const betrag = Number(row[betragIdx]);
    const von = String(row[vonIdx] ?? '').trim();
    if (!isFinite(betrag) || betrag <= 0) continue;
    gesamtkosten += betrag;
    if (von && ausgabenMap.has(von)) {
      ausgabenMap.set(von, (ausgabenMap.get(von) ?? 0) + betrag);
    }
  }

  const personen: SplidPerson[] = personenNamen.map((name) => ({
    name,
    ausgaben: Math.round((ausgabenMap.get(name) ?? 0) * 100) / 100,
  }));

  return {
    rundenname,
    gesamtkosten: Math.round(gesamtkosten * 100) / 100,
    personen,
  };
}
