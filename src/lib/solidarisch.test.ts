import { describe, it, expect } from 'vitest';
import {
  berechneAuswertung,
  berechneAusgleich,
  berechneRichtwert,
  type Gebot,
  type GebotErgebnis,
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
// berechneRichtwert
// ---------------------------------------------------------------------------

describe('berechneRichtwert', () => {
  it('berechnet richtwert korrekt', () => {
    // 3 Slots à gewichtung=1, anzahl=1 → summe=3, richtwert=300/3=100
    const slots: Slot[] = [
      { label: 'A', gewichtung: 1, anzahl: 1 },
      { label: 'B', gewichtung: 1, anzahl: 1 },
      { label: 'C', gewichtung: 1, anzahl: 1 },
    ];
    expect(berechneRichtwert(300, slots)).toBe(100);
  });

  it('berücksichtigt gewichtung × anzahl', () => {
    // Familie: gewichtung=2, anzahl=2 → 4; Single: gewichtung=1, anzahl=1 → 1; summe=5
    const slots: Slot[] = [
      { label: 'Familie', gewichtung: 2, anzahl: 2 },
      { label: 'Single', gewichtung: 1, anzahl: 1 },
    ];
    expect(berechneRichtwert(500, slots)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Standardgebot: synthetische Gebote werden korrekt verarbeitet
// ---------------------------------------------------------------------------

describe('Standardgebot (synthetische Gebote)', () => {
  it('istStandard wird in GebotErgebnis durchgereicht', () => {
    const slots: Slot[] = [
      { label: 'Erwachsener', gewichtung: 1, anzahl: 1 },
      { label: 'Kind', gewichtung: 0.5, anzahl: 1, standardgebot: 40 },
    ];
    const gebote: Gebot[] = [
      { emojiId: '🐼🚀🌈', slotLabel: 'Erwachsener', gewichtung: 1, betrag: 80 },
      { emojiId: '—', slotLabel: 'Kind', gewichtung: 0.5, betrag: 40, istStandard: true },
    ];
    const result = berechneAuswertung(120, gebote, slots);

    const kind = result.ergebnisse.find((e) => e.slotLabel === 'Kind')!;
    expect(kind.istStandard).toBe(true);
    expect(kind.gebot).toBe(40);
  });

  it('echtes Gebot für Slot mit standardgebot: istStandard bleibt undefined', () => {
    const slots: Slot[] = [
      { label: 'Kind', gewichtung: 0.5, anzahl: 1, standardgebot: 40 },
    ];
    const gebote: Gebot[] = [
      { emojiId: '🌟🎉🦋', slotLabel: 'Kind', gewichtung: 0.5, betrag: 60 },
    ];
    const result = berechneAuswertung(120, gebote, slots);
    expect(result.ergebnisse[0].istStandard).toBeUndefined();
    expect(result.ergebnisse[0].gebot).toBe(60);
  });

  it('summeBeitraege korrekt bei gemischten echten + synthetischen Geboten', () => {
    // richtwert = 120 / (1×1 + 0.5×1) = 120 / 1.5 = 80
    // Erwachsener: gebot=90, richtwertAnteil=80, ueberRichtwert=10
    // Kind (Standard): gebot=40, richtwertAnteil=40, ueberRichtwert=0
    // summeGebote = 130, überschuss = 10
    // Erwachsener: geldZurueck = 10, beitrag = 80
    // Kind: beitrag = 40
    // summeBeitraege ≈ 120
    const slots: Slot[] = [
      { label: 'Erwachsener', gewichtung: 1, anzahl: 1 },
      { label: 'Kind', gewichtung: 0.5, anzahl: 1, standardgebot: 40 },
    ];
    const gebote: Gebot[] = [
      { emojiId: '🐼🚀🌈', slotLabel: 'Erwachsener', gewichtung: 1, betrag: 90 },
      { emojiId: '—', slotLabel: 'Kind', gewichtung: 0.5, betrag: 40, istStandard: true },
    ];
    const result = berechneAuswertung(120, gebote, slots);
    expect(result.summeBeitraege).toBeCloseTo(120);
  });
});

// ---------------------------------------------------------------------------
// berechneAusgleich
// ---------------------------------------------------------------------------

function ergebnis(
  emojiId: string,
  slotLabel: string,
  solidarischerBeitrag: number,
  overrides: Partial<GebotErgebnis> = {},
): GebotErgebnis {
  return {
    emojiId,
    slotLabel,
    gewichtung: 1,
    gebot: solidarischerBeitrag,
    richtwertAnteil: solidarischerBeitrag,
    ueberRichtwert: 0,
    geldZurueck: 0,
    solidarischerBeitrag,
    ...overrides,
  };
}

describe('berechneAusgleich', () => {
  it('einfacher Fall: A schuldet B → eine Überweisung', () => {
    // A hat 30 € gezahlt, soll 80 € zahlen → schuldet 50 €
    // B hat 120 € gezahlt, soll 70 € zahlen → bekommt 50 € zurück
    const ergebnisse: GebotErgebnis[] = [
      ergebnis('🐼🚀🌈', 'A', 80),
      ergebnis('🦊🌙⭐', 'B', 70),
    ];
    const ausgaben = new Map([['A', 30], ['B', 120]]);
    const zahlungen = berechneAusgleich(ergebnisse, ausgaben);

    expect(zahlungen).toHaveLength(1);
    expect(zahlungen[0].von).toBe('🐼🚀🌈');
    expect(zahlungen[0].an).toBe('🦊🌙⭐');
    expect(zahlungen[0].betrag).toBeCloseTo(50);
  });

  it('ohne Ausgaben → leere Liste (keine Gläubiger)', () => {
    const ergebnisse: GebotErgebnis[] = [
      ergebnis('🐼🚀🌈', 'A', 80),
      ergebnis('🦊🌙⭐', 'B', 70),
    ];
    const ausgaben = new Map<string, number>();
    expect(berechneAusgleich(ergebnisse, ausgaben)).toHaveLength(0);
  });

  it('ausgeglichener Fall: nochZuZahlen = 0 für alle → leere Liste', () => {
    const ergebnisse: GebotErgebnis[] = [
      ergebnis('🐼🚀🌈', 'A', 80),
      ergebnis('🦊🌙⭐', 'B', 70),
    ];
    const ausgaben = new Map([['A', 80], ['B', 70]]);
    expect(berechneAusgleich(ergebnisse, ausgaben)).toHaveLength(0);
  });

  it('drei Personen: A schuldet B und C', () => {
    // A: zahlt 0, schuldet 100 → schuldet 100
    // B: zahlt 60, schuldet 40 → Gläubiger 20
    // C: zahlt 90, schuldet 60 → Gläubiger 30
    // Gesamtschulden = 100, Gesamtforderungen = 50
    // (Zahlen nicht exakt ausgeglichen → Fehlbetrag-Szenario, aber Algorithmus läuft durch)
    const ergebnisse: GebotErgebnis[] = [
      ergebnis('🐼🚀🌈', 'A', 100),
      ergebnis('🦊🌙⭐', 'B', 40),
      ergebnis('🌟🎉🦋', 'C', 60),
    ];
    const ausgaben = new Map([['A', 0], ['B', 60], ['C', 90]]);
    const zahlungen = berechneAusgleich(ergebnisse, ausgaben);
    // C ist größter Gläubiger (30), B Gläubiger (20), A Schuldner (100)
    // A zahlt 30 an C, dann 20 an B, dann Rest (50) bleibt offen (kein weiterer Gläubiger)
    expect(zahlungen.length).toBeGreaterThanOrEqual(2);
    const anC = zahlungen.find((z) => z.an === '🌟🎉🦋');
    const anB = zahlungen.find((z) => z.an === '🦊🌙⭐');
    expect(anC?.betrag).toBeCloseTo(30);
    expect(anB?.betrag).toBeCloseTo(20);
  });

  it('minimiert Überweisungen: A schuldet B, B schuldet C → direkt A an C', () => {
    // A: zahlt 0, soll 50 → schuldet 50
    // B: zahlt 50, soll 50 → ausgeglichen
    // C: zahlt 100, soll 50 → Gläubiger 50
    const ergebnisse: GebotErgebnis[] = [
      ergebnis('🐼🚀🌈', 'A', 50),
      ergebnis('🦊🌙⭐', 'B', 50),
      ergebnis('🌟🎉🦋', 'C', 50),
    ];
    const ausgaben = new Map([['A', 0], ['B', 50], ['C', 100]]);
    const zahlungen = berechneAusgleich(ergebnisse, ausgaben);
    expect(zahlungen).toHaveLength(1);
    expect(zahlungen[0].von).toBe('🐼🚀🌈');
    expect(zahlungen[0].an).toBe('🌟🎉🦋');
    expect(zahlungen[0].betrag).toBeCloseTo(50);
  });

  it('Standard-Slot als Schuldner erscheint mit slotLabel in Ausgleichszahlungen', () => {
    const ergebnisse: GebotErgebnis[] = [
      ergebnis('🐼🚀🌈', 'A', 80),
      ergebnis('—', 'B', 40, { istStandard: true }),
    ];
    // A: solidarisch 80, ausgaben 100 → Gläubiger 20
    // B: solidarisch 40, ausgaben 0 → Schuldner 40
    const ausgaben = new Map([['A', 100], ['B', 0]]);
    const zahlungen = berechneAusgleich(ergebnisse, ausgaben);
    expect(zahlungen).toHaveLength(1);
    expect(zahlungen[0].von).toBe('B');
    expect(zahlungen[0].an).toBe('🐼🚀🌈');
    expect(zahlungen[0].betrag).toBeCloseTo(20);
  });

  it('mehrere Standard-Slots im selben Slot werden aggregiert', () => {
    const ergebnisse: GebotErgebnis[] = [
      ergebnis('—', 'Kind', 30, { istStandard: true }),
      ergebnis('—', 'Kind', 30, { istStandard: true }),
      ergebnis('🌟🎉🦋', 'Erwachsen', 60),
    ];
    // Kind: 2×30=60 solidarisch, ausgaben 0 → schuldet 60
    // Erwachsen: 60 solidarisch, ausgaben 120 → Gläubiger 60
    const ausgaben = new Map([['Kind', 0], ['Erwachsen', 120]]);
    const zahlungen = berechneAusgleich(ergebnisse, ausgaben);
    expect(zahlungen).toHaveLength(1);
    expect(zahlungen[0].von).toBe('Kind');
    expect(zahlungen[0].an).toBe('🌟🎉🦋');
    expect(zahlungen[0].betrag).toBeCloseTo(60);
  });

  it('Standard-Slot als Gläubiger wenn ausgaben > solidarischerBeitrag', () => {
    const ergebnisse: GebotErgebnis[] = [
      ergebnis('🐼🚀🌈', 'A', 80),
      ergebnis('—', 'B', 20, { istStandard: true }),
    ];
    // A: solidarisch 80, ausgaben 120 → Gläubiger 40
    // B: solidarisch 20, ausgaben 100 → Gläubiger 80  (ausgaben > beitrag)
    // kein Schuldner → keine Zahlungen
    const ausgaben = new Map([['A', 120], ['B', 100]]);
    const zahlungen = berechneAusgleich(ergebnisse, ausgaben);
    expect(zahlungen).toHaveLength(0);
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
