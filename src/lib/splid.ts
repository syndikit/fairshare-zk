/**
 * FairShare ZK — Splid-Import
 *
 * Liest eine Splid-XLSX-Exportdatei (Sheet "Zusammenfassung") im Browser
 * und extrahiert Rundenname, Gesamtkosten und Teilnehmer mit ihren Ausgaben.
 * Die Datei verlässt dabei das Gerät nicht.
 */

import ExcelJS from 'exceljs';

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
export async function parseSplid(buffer: ArrayBuffer): Promise<SplidImport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const SHEET = 'Zusammenfassung';
  const ws = wb.getWorksheet(SHEET);
  if (!ws) {
    throw new Error(
      'Datei enthält kein Sheet „Zusammenfassung". Bitte einen Splid-Export verwenden.',
    );
  }

  // Rundenname aus A1 (Zeile 1, Spalte 1 — ExcelJS ist 1-indexed)
  const rundenname = String(ws.getCell(1, 1).value ?? '').trim();
  if (!rundenname) {
    throw new Error('Rundenname nicht gefunden (Zelle A1 ist leer).');
  }

  // Kopfzeile finden: erste Zeile mit beiden Spalten "Von" und "Betrag"
  // row.values ist in ExcelJS 1-indexed (Index 0 = undefined)
  let headerRowNum = -1;
  let vonIdx = -1;
  let betragIdx = -1;
  let personenStartCol = 7; // Fallback: Spalte G (1-indexed)

  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (headerRowNum !== -1) return;
    const vals = row.values as unknown[];
    const vonI = vals.findIndex((c) => String(c ?? '').trim() === 'Von');
    const betragI = vals.findIndex((c) => String(c ?? '').trim() === 'Betrag');
    if (vonI > 0 && betragI > 0) {
      headerRowNum = rowNum;
      vonIdx = vonI;
      betragIdx = betragI;
      const erstelltAmI = vals.findIndex((c) => String(c ?? '').trim() === 'Erstellt am');
      personenStartCol = erstelltAmI > 0 ? erstelltAmI + 1 : 7;
    }
  });

  if (headerRowNum === -1) {
    throw new Error(
      'Kopfzeile nicht gefunden. Erwartet werden Spalten „Von" und „Betrag".',
    );
  }

  // Personennamen aus Kopfzeile extrahieren (ungerade Spalten ab personenStartCol)
  const headerVals = ws.getRow(headerRowNum).values as unknown[];
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

  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum <= headerRowNum) return;
    const vals = row.values as unknown[];
    const betrag = Number(vals[betragIdx]);
    const von = String(vals[vonIdx] ?? '').trim();
    if (!isFinite(betrag) || betrag <= 0) return;
    gesamtkosten += betrag;
    if (von && ausgabenMap.has(von)) {
      ausgabenMap.set(von, (ausgabenMap.get(von) ?? 0) + betrag);
    }
  });

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
