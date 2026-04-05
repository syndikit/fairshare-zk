import { describe, it, expect } from 'vitest';
import {
  berechneRichtwert,
  berechneBeitrag,
  berechneAuswertung,
  type Gebot,
} from './solidarisch';

// ---------------------------------------------------------------------------
// Hilfsfunktion: Gebot-Objekt mit Defaults
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

// ---------------------------------------------------------------------------
// berechneRichtwert
// ---------------------------------------------------------------------------

describe('berechneRichtwert', () => {
  it('einfacher Fall: zwei gleiche Gewichtungen', () => {
    const gebote = [gebot(1, 100), gebot(1, 100)];
    // richtwert = 200 / (1 + 1) = 100
    expect(berechneRichtwert(200, gebote)).toBe(100);
  });

  it('unterschiedliche Gewichtungen', () => {
    const gebote = [gebot(2, 80), gebot(1, 15)];
    // richtwert = 150 / (2 + 1) = 50
    expect(berechneRichtwert(150, gebote)).toBeCloseTo(50);
  });

  it('einzelnes Gebot', () => {
    const gebote = [gebot(1.5, 200)];
    // richtwert = 300 / 1.5 = 200
    expect(berechneRichtwert(300, gebote)).toBeCloseTo(200);
  });

  it('wirft bei leerer Gebote-Liste', () => {
    expect(() => berechneRichtwert(100, [])).toThrow('Keine Gebote vorhanden');
  });
});

// ---------------------------------------------------------------------------
// berechneBeitrag
// ---------------------------------------------------------------------------

describe('berechneBeitrag', () => {
  it('Gebot unter Anteil → zahlt nur Gebot', () => {
    const g = gebot(1, 70);
    const ergebnis = berechneBeitrag(g, 100);
    expect(ergebnis.anteil).toBe(100);
    expect(ergebnis.solidarischerBeitrag).toBe(70);
    expect(ergebnis.differenz).toBe(0);
  });

  it('Gebot über Anteil → wird auf Anteil reduziert', () => {
    const g = gebot(1, 150);
    const ergebnis = berechneBeitrag(g, 100);
    expect(ergebnis.anteil).toBe(100);
    expect(ergebnis.solidarischerBeitrag).toBe(100);
    expect(ergebnis.differenz).toBe(50);
  });

  it('Gebot exakt gleich Anteil → zahlt Anteil', () => {
    const g = gebot(1, 100);
    const ergebnis = berechneBeitrag(g, 100);
    expect(ergebnis.solidarischerBeitrag).toBe(100);
    expect(ergebnis.differenz).toBe(0);
  });

  it('Faktor 0.5: Anteil ist halb so groß', () => {
    const g = gebot(0.5, 30);
    const ergebnis = berechneBeitrag(g, 100);
    // anteil = 0.5 × 100 = 50, Gebot 30 < 50 → beitrag = 30
    expect(ergebnis.anteil).toBe(50);
    expect(ergebnis.solidarischerBeitrag).toBe(30);
  });

  it('gibt korrekte Metadaten zurück', () => {
    const g = gebot(2, 80, { emojiId: '🦊🌙⭐', slotLabel: 'Familie' });
    const ergebnis = berechneBeitrag(g, 100);
    expect(ergebnis.emojiId).toBe('🦊🌙⭐');
    expect(ergebnis.slotLabel).toBe('Familie');
    expect(ergebnis.gewichtung).toBe(2);
    expect(ergebnis.gebot).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// berechneAuswertung
// ---------------------------------------------------------------------------

describe('berechneAuswertung', () => {
  it('alle zahlen weniger als Richtwert → Fehlbetrag entsteht', () => {
    // richtwert = 1000 / 2 = 500
    // beide zahlen je 200 → beitrag 200 + 200 = 400 < 1000 → fehlbetrag = 600
    const gebote = [gebot(1, 200), gebot(1, 200)];
    const result = berechneAuswertung(1000, gebote);
    expect(result.fehlbetrag).toBeCloseTo(600);
    expect(result.ueberschuss).toBe(0);
  });

  it('alle bieten mehr als Richtwert → Überschuss möglich, alle reduziert', () => {
    // richtwert = 100 / 2 = 50
    // beide bieten 200, anteil je 50 → beitrag 50 + 50 = 100 = gesamtkosten
    const gebote = [gebot(1, 200), gebot(1, 200)];
    const result = berechneAuswertung(100, gebote);
    expect(result.summeBeitraege).toBeCloseTo(100);
    expect(result.fehlbetrag).toBe(0);
    // kein Überschuss, exakt gedeckt
    expect(result.ueberschuss).toBeCloseTo(0);
  });

  it('Beispiel aus ANFORDERUNGEN.md: gemischte Gebote', () => {
    // Slot "Familie" Faktor 2.0: Gebot 80
    // Slot "Student" Faktor 0.5: Gebot 15
    // richtwert = 1000 / (2.0 + 0.5) = 400
    // anteil Familie = 800, Gebot 80 < 800 → beitrag = 80
    // anteil Student = 200, Gebot 15 < 200 → beitrag = 15
    // summeBeitraege = 95, fehlbetrag = 905
    const gebote = [
      gebot(2.0, 80, { emojiId: '🐼🚀🌈', slotLabel: 'Familie' }),
      gebot(0.5, 15, { emojiId: '🦊🌙⭐', slotLabel: 'Student' }),
    ];
    const result = berechneAuswertung(1000, gebote);
    expect(result.richtwert).toBeCloseTo(400);
    expect(result.ergebnisse[0].solidarischerBeitrag).toBe(80);
    expect(result.ergebnisse[1].solidarischerBeitrag).toBe(15);
    expect(result.summeBeitraege).toBeCloseTo(95);
    expect(result.fehlbetrag).toBeCloseTo(905);
  });

  it('enthält korrekte Anzahl Ergebnisse', () => {
    const gebote = [gebot(1, 50), gebot(1, 60), gebot(2, 100)];
    const result = berechneAuswertung(300, gebote);
    expect(result.ergebnisse).toHaveLength(3);
  });

  it('fehlbetrag und ueberschuss sind nie beide > 0', () => {
    const gebote = [gebot(1, 50), gebot(1, 200)];
    const result = berechneAuswertung(100, gebote);
    expect(result.fehlbetrag === 0 || result.ueberschuss === 0).toBe(true);
  });

  it('summeGebote ist die Summe aller rohen Gebote', () => {
    const gebote = [gebot(1, 50), gebot(1, 70)];
    const result = berechneAuswertung(200, gebote);
    expect(result.summeGebote).toBe(120);
  });

  it('wirft bei leerer Gebote-Liste', () => {
    expect(() => berechneAuswertung(100, [])).toThrow('Keine Gebote vorhanden');
  });

  it('wirft bei Gesamtkosten <= 0', () => {
    expect(() => berechneAuswertung(0, [gebot(1, 50)])).toThrow(
      'Gesamtkosten müssen größer als 0 sein',
    );
    expect(() => berechneAuswertung(-100, [gebot(1, 50)])).toThrow(
      'Gesamtkosten müssen größer als 0 sein',
    );
  });
});
