import { describe, it, expect } from 'vitest';
import {
  berechneAuswertung,
  type Gebot,
  type Slot,
} from './solidarisch';

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function gebot(
  gewichtung: number,
  betrag: number,
  overrides: Partial<Gebot> = {},
): Gebot {
  return {
    emojiId: '🐼🚀🌈',
    slotLabel: 'Slot',
    gewichtung,
    betrag,
    ...overrides,
  };
}

function slot(label: string, gewichtung: number, anzahl = 1): Slot {
  return { label, gewichtung, anzahl };
}

// ---------------------------------------------------------------------------
// Richtwert aus ALLEN Slots (inkl. unbelegte)
// ---------------------------------------------------------------------------

describe('Richtwert-Berechnung aus allen Slots', () => {
  it('verwendet alle Slots, auch wenn nicht alle belegt sind', () => {
    // 3 Slots definiert: je Gewichtung 1, anzahl 1 → summe = 3
    // richtwert = 300 / 3 = 100
    // Aber nur 2 Gebote eingegangen
    const slots = [slot('A', 1), slot('B', 1), slot('C', 1)];
    const gebote = [
      gebot(1, 120, { slotLabel: 'A' }),
      gebot(1, 100, { slotLabel: 'B' }),
    ];
    const result = berechneAuswertung(300, gebote, slots);
    expect(result.richtwert).toBe(100);
  });

  it('berücksichtigt anzahl bei Slots', () => {
    // Slot "Familie" gewichtung=2, anzahl=3 → trägt 6 bei
    // Slot "Single" gewichtung=1, anzahl=2 → trägt 2 bei
    // summe = 8, richtwert = 800 / 8 = 100
    const slots = [slot('Familie', 2, 3), slot('Single', 1, 2)];
    const gebote = [gebot(2, 150, { slotLabel: 'Familie' })];
    const result = berechneAuswertung(800, gebote, slots);
    expect(result.richtwert).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Fehlbetrag-Fall: alle bieten weniger als Richtwert-Anteil
// ---------------------------------------------------------------------------

describe('Fehlbetrag-Fall', () => {
  it('kein geldZurueck, summeBeitraege < gesamtkosten', () => {
    // richtwert = 1000 / 2 = 500
    // beide bieten 200 < richtwertAnteil 500 → kein ueberRichtwert
    const slots = [slot('A', 1), slot('B', 1)];
    const gebote = [gebot(1, 200), gebot(1, 200)];
    const result = berechneAuswertung(1000, gebote, slots);

    expect(result.fehlbetrag).toBeCloseTo(600);
    expect(result.ueberschuss).toBe(0);
    for (const e of result.ergebnisse) {
      expect(e.geldZurueck).toBe(0);
      expect(e.solidarischerBeitrag).toBe(e.gebot);
    }
  });

  it('fehlbetrag = gesamtkosten − summeBeitraege', () => {
    const slots = [slot('A', 1)];
    const gebote = [gebot(1, 50)];
    const result = berechneAuswertung(200, gebote, slots);
    expect(result.fehlbetrag).toBeCloseTo(result.gesamtkosten - result.summeBeitraege);
  });
});

// ---------------------------------------------------------------------------
// Überschuss-Fall: alle bieten mehr als Richtwert-Anteil
// ---------------------------------------------------------------------------

describe('Überschuss-Fall', () => {
  it('geldZurueck verteilt, summeBeitraege ≈ gesamtkosten', () => {
    // richtwert = 100 / 2 = 50, beide bieten 80 → ueberRichtwert je 30
    // überschuss = 160 − 100 = 60, geldZurueck je 30
    // solidarischerBeitrag je 80 − 30 = 50
    const slots = [slot('A', 1), slot('B', 1)];
    const gebote = [gebot(1, 80), gebot(1, 80)];
    const result = berechneAuswertung(100, gebote, slots);

    expect(result.ueberschuss).toBeCloseTo(60);
    expect(result.fehlbetrag).toBe(0);
    expect(result.summeBeitraege).toBeCloseTo(100);
    for (const e of result.ergebnisse) {
      expect(e.geldZurueck).toBeCloseTo(30);
      expect(e.solidarischerBeitrag).toBeCloseTo(50);
    }
  });

  it('nur Personen mit ueberRichtwert bekommen geldZurueck', () => {
    // richtwert = 100 / 2 = 50
    // A bietet 80 → ueberRichtwert 30
    // B bietet 30 → kein ueberRichtwert (30 < 50)
    // überschuss = 110 − 100 = 10
    // A: geldZurueck = (30/30) × 10 = 10, beitrag = 70
    // B: geldZurueck = 0, beitrag = 30
    const slots = [slot('A', 1), slot('B', 1)];
    const gebote = [
      gebot(1, 80, { slotLabel: 'A' }),
      gebot(1, 30, { slotLabel: 'B' }),
    ];
    const result = berechneAuswertung(100, gebote, slots);

    const a = result.ergebnisse.find((e) => e.slotLabel === 'A')!;
    const b = result.ergebnisse.find((e) => e.slotLabel === 'B')!;

    expect(a.geldZurueck).toBeCloseTo(10);
    expect(a.solidarischerBeitrag).toBeCloseTo(70);
    expect(b.geldZurueck).toBe(0);
    expect(b.solidarischerBeitrag).toBe(30);
    expect(result.summeBeitraege).toBeCloseTo(100);
  });
});

// ---------------------------------------------------------------------------
// Gemischter Fall: Überschuss proportional auf Overbidder verteilt
// ---------------------------------------------------------------------------

describe('Gemischter Fall', () => {
  it('proportionale Verteilung bei unterschiedlichen ueberRichtwert-Beträgen', () => {
    // richtwert = 300 / 3 = 100
    // A: gewichtung=1, Gebot=180 → ueberRichtwert=80
    // B: gewichtung=1, Gebot=130 → ueberRichtwert=30
    // C: gewichtung=1, Gebot=60  → kein ueberRichtwert
    // summeGebote = 370, überschuss = 70
    // summeUeberRichtwert = 110
    // A geldZurueck = (80/110) × 70 ≈ 50.91
    // B geldZurueck = (30/110) × 70 ≈ 19.09
    const slots = [slot('A', 1), slot('B', 1), slot('C', 1)];
    const gebote = [
      gebot(1, 180, { slotLabel: 'A' }),
      gebot(1, 130, { slotLabel: 'B' }),
      gebot(1, 60, { slotLabel: 'C' }),
    ];
    const result = berechneAuswertung(300, gebote, slots);

    const a = result.ergebnisse.find((e) => e.slotLabel === 'A')!;
    const b = result.ergebnisse.find((e) => e.slotLabel === 'B')!;
    const c = result.ergebnisse.find((e) => e.slotLabel === 'C')!;

    expect(a.geldZurueck).toBeGreaterThan(0);
    expect(b.geldZurueck).toBeGreaterThan(0);
    expect(c.geldZurueck).toBe(0);
    expect(a.geldZurueck).toBeGreaterThan(b.geldZurueck);
    expect(result.summeBeitraege).toBeCloseTo(300);
  });
});

// ---------------------------------------------------------------------------
// Normalfall: summeGebote = gesamtkosten → kein geldZurueck
// ---------------------------------------------------------------------------

describe('Normalfall (exakt gedeckt)', () => {
  it('keine Überschuss-Verteilung wenn summeGebote = gesamtkosten', () => {
    // richtwert = 200 / 2 = 100, beide bieten exakt 100
    const slots = [slot('A', 1), slot('B', 1)];
    const gebote = [gebot(1, 100), gebot(1, 100)];
    const result = berechneAuswertung(200, gebote, slots);

    expect(result.ueberschuss).toBe(0);
    expect(result.fehlbetrag).toBe(0);
    for (const e of result.ergebnisse) {
      expect(e.geldZurueck).toBe(0);
      expect(e.solidarischerBeitrag).toBeCloseTo(e.gebot);
    }
  });
});

// ---------------------------------------------------------------------------
// Korrekte Felder in GebotErgebnis
// ---------------------------------------------------------------------------

describe('GebotErgebnis Felder', () => {
  it('richtwertAnteil = gewichtung × richtwert', () => {
    // richtwert = 300 / (1+2) = 100
    const slots = [slot('A', 1), slot('B', 2)];
    const gebote = [
      gebot(1, 80, { slotLabel: 'A' }),
      gebot(2, 250, { slotLabel: 'B' }),
    ];
    const result = berechneAuswertung(300, gebote, slots);

    const a = result.ergebnisse.find((e) => e.slotLabel === 'A')!;
    const b = result.ergebnisse.find((e) => e.slotLabel === 'B')!;

    expect(a.richtwertAnteil).toBeCloseTo(1 * result.richtwert);
    expect(b.richtwertAnteil).toBeCloseTo(2 * result.richtwert);
  });

  it('summeGebote enthält rohe Gebots-Summe', () => {
    const slots = [slot('A', 1), slot('B', 1)];
    const gebote = [gebot(1, 50), gebot(1, 70)];
    const result = berechneAuswertung(200, gebote, slots);
    expect(result.summeGebote).toBe(120);
  });
});

// ---------------------------------------------------------------------------
// Rundungskorrektur: summeBeitraege ≈ gesamtkosten (nie größer)
// ---------------------------------------------------------------------------

describe('Rundungskorrektur', () => {
  it('summeBeitraege weicht höchstens 1 Cent von gesamtkosten ab', () => {
    // Schiefer Fall mit vielen Dezimalstellen
    const slots = [slot('A', 1), slot('B', 1), slot('C', 1)];
    const gebote = [gebot(1, 100), gebot(1, 100), gebot(1, 100)];
    const result = berechneAuswertung(299.99, gebote, slots);

    expect(Math.abs(result.summeBeitraege - result.gesamtkosten)).toBeLessThanOrEqual(0.01);
  });
});

// ---------------------------------------------------------------------------
// Fehlerfälle
// ---------------------------------------------------------------------------

describe('Fehlerfälle', () => {
  const einSlot = [slot('A', 1)];

  it('wirft bei Gesamtkosten = 0', () => {
    expect(() => berechneAuswertung(0, [gebot(1, 50)], einSlot)).toThrow(
      'Gesamtkosten müssen größer als 0 sein',
    );
  });

  it('wirft bei negativen Gesamtkosten', () => {
    expect(() => berechneAuswertung(-100, [gebot(1, 50)], einSlot)).toThrow(
      'Gesamtkosten müssen größer als 0 sein',
    );
  });

  it('wirft bei leerer Gebote-Liste', () => {
    expect(() => berechneAuswertung(100, [], einSlot)).toThrow('Keine Gebote vorhanden');
  });

  it('wirft bei leerer Slots-Liste', () => {
    expect(() => berechneAuswertung(100, [gebot(1, 50)], [])).toThrow('Keine Slots definiert');
  });
});
