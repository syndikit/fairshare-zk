/**
 * FairShare ZK — Splid-Import
 *
 * Liest eine Splid-Exportdatei (Sheet "Zusammenfassung") im Browser
 * und extrahiert Rundenname, Gesamtkosten und Teilnehmer mit ihren Ausgaben.
 * Unterstützt .xlsx und .xls (Excel 97-2003). Die Datei verlässt dabei das Gerät nicht.
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
 * Parst einen ArrayBuffer einer Splid-Export-Datei (.xlsx oder .xls).
 * Wirft bei ungültigem Format mit einer verständlichen Fehlermeldung.
 */
export async function parseSplid(buffer: ArrayBuffer): Promise<SplidImport> {
  const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' });

  const SHEET = 'Zusammenfassung';
  if (!wb.SheetNames.includes(SHEET)) {
    throw new Error(
      'Datei enthält kein Sheet „Zusammenfassung". Bitte einen Splid-Export verwenden.',
    );
  }
  const ws = wb.Sheets[SHEET];

  // Alle Zeilen als 2D-Array (0-indexed)
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // Rundenname aus Zeile 0, Spalte 0
  const rundenname = String(rows[0]?.[0] ?? '').trim();
  if (!rundenname) {
    throw new Error('Rundenname nicht gefunden (Zelle A1 ist leer).');
  }

  // Kopfzeile finden: erste Zeile mit beiden Spalten "Von" und "Betrag"
  let headerRowIdx = -1;
  let vonIdx = -1;
  let betragIdx = -1;
  let personenStartCol = 6; // Fallback: Spalte G (0-indexed)

  for (let i = 0; i < rows.length; i++) {
    const vals = rows[i];
    const vonI = vals.findIndex((c) => String(c ?? '').trim() === 'Von');
    const betragI = vals.findIndex((c) => String(c ?? '').trim() === 'Betrag');
    if (vonI >= 0 && betragI >= 0) {
      headerRowIdx = i;
      vonIdx = vonI;
      betragIdx = betragI;
      const erstelltAmI = vals.findIndex((c) => String(c ?? '').trim() === 'Erstellt am');
      personenStartCol = erstelltAmI >= 0 ? erstelltAmI + 1 : 6;
      break;
    }
  }

  if (headerRowIdx === -1) {
    throw new Error(
      'Kopfzeile nicht gefunden. Erwartet werden Spalten „Von" und „Betrag".',
    );
  }

  // Personennamen aus Kopfzeile extrahieren (ungerade Spalten ab personenStartCol)
  const headerVals = rows[headerRowIdx];
  const personenNamen: string[] = [];
  for (let col = personenStartCol; col < headerVals.length; col += 2) {
    const name = String(headerVals[col] ?? '').trim();
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
    const vals = rows[i];
    const betrag = Number(vals[betragIdx]);
    const von = String(vals[vonIdx] ?? '').trim();
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
