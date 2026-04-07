/**
 * FairShare ZK — Solidarische Berechnungslogik + Emoji-IDs
 *
 * Alle Funktionen sind synchron und side-effect-frei (außer generiereEmojiId).
 * Keine Krypto-Operationen hier — nur Arithmetik und Emoji-Auswahl.
 */

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export interface Slot {
  label: string;
  gewichtung: number;
  anzahl: number;
  ausgaben?: number; // aus Splid importierte Ausgaben der Person (optional)
  standardgebot?: number; // optionaler Standardwert (€), wird zur Auswertungszeit eingesetzt
}

export interface Gebot {
  emojiId: string;
  slotLabel: string;
  gewichtung: number;
  betrag: number;
  istStandard?: boolean; // true wenn aus standardgebot synthetisiert (kein echtes Gebot)
}

export interface GebotErgebnis {
  emojiId: string;
  slotLabel: string;
  gewichtung: number;
  gebot: number;
  richtwertAnteil: number;      // gewichtung × richtwert (fairer Anteil laut Richtwert)
  ueberRichtwert: number;       // max(0, gebot − richtwertAnteil)
  geldZurueck: number;          // proportionaler Anteil am Überschuss
  solidarischerBeitrag: number; // gebot − geldZurueck
  istStandard?: boolean;        // true wenn aus standardgebot synthetisiert (kein echtes Gebot)
}

export interface Ausgleichszahlung {
  von: string;  // emojiId Schuldner
  an: string;   // emojiId Gläubiger
  betrag: number;
}

export interface Auswertung {
  richtwert: number;
  gesamtkosten: number;
  summeGebote: number;
  summeBeitraege: number;
  fehlbetrag: number;  // > 0 wenn Gebote die Kosten nicht decken
  ueberschuss: number; // summeGebote − gesamtkosten vor Verteilung (>= 0)
  ergebnisse: GebotErgebnis[];
}

// ---------------------------------------------------------------------------
// Emoji-ID
// ---------------------------------------------------------------------------

export const EMOJIS: readonly string[] = [
  '🌟', '🎉', '🦋', '🌈', '🐼', '🚀', '🌺', '🦄', '🎸', '🌊',
  '🦊', '🌙', '⭐', '🌻', '🦁', '🎨', '🌸', '🐬', '🎭', '🌴',
  '🦅', '🎪', '🌹', '🐳', '🎯', '🌞', '🦉', '🎵', '🌿', '🐙',
  '🎠', '🌄', '🦜', '🐘', '🌏', '🦚', '🎡', '🌠', '🐓', '🦩',
  '🌋', '🦢', '🎢', '🌬', '🐦', '🎲', '🌜', '🦝', '🎷', '🌝',
];

/** Generiert eine zufällige Emoji-ID aus 3 Emojis (50³ = 125.000 Kombinationen). */
export function generiereEmojiId(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return [
    EMOJIS[bytes[0] % EMOJIS.length],
    EMOJIS[bytes[1] % EMOJIS.length],
    EMOJIS[bytes[2] % EMOJIS.length],
  ].join('');
}

// ---------------------------------------------------------------------------
// Berechnungslogik
// ---------------------------------------------------------------------------

/**
 * Berechnet den Richtwert (Kosten pro Gewichtungseinheit) aus allen definierten Slots.
 * Kann auf Teilnehmer- und Admin-Seite genutzt werden.
 */
export function berechneRichtwert(gesamtkosten: number, slots: Slot[]): number {
  const summe = slots.reduce((s, slot) => s + slot.gewichtung * slot.anzahl, 0);
  return Math.round(gesamtkosten / summe * 100) / 100;
}

function runden(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Vollständige Auswertung einer Runde nach dem solidarischen Modell.
 *
 * @param gesamtkosten - Gesamtkosten der Runde
 * @param gebote       - Eingegangene Gebote
 * @param alleSlots    - ALLE definierten Slot-Typen inkl. unbelegter
 *
 * Der Richtwert wird aus ALLEN definierten Slots berechnet (gewichtung × anzahl),
 * nicht nur aus den eingegangenen Geboten. Das stellt sicher, dass unbelegte Slots
 * die Kosten mitverantworten und der Richtwert stabil bleibt.
 *
 * Überschuss (summeGebote > gesamtkosten) wird proportional an die zurückgegeben,
 * die mehr als ihren Richtwert-Anteil geboten haben — sodass summeBeitraege ≈ gesamtkosten.
 */
export function berechneAuswertung(
  gesamtkosten: number,
  gebote: Gebot[],
  alleSlots: Slot[],
): Auswertung {
  if (gesamtkosten <= 0) throw new Error('Gesamtkosten müssen größer als 0 sein');
  if (gebote.length === 0) throw new Error('Keine Gebote vorhanden');
  if (alleSlots.length === 0) throw new Error('Keine Slots definiert');

  // 1. Richtwert aus ALLEN definierten Slots (gewichtung × anzahl)
  const summeAlleGewichtungen = alleSlots.reduce(
    (s, slot) => s + slot.gewichtung * slot.anzahl,
    0,
  );
  const richtwert = runden(gesamtkosten / summeAlleGewichtungen);

  // 2. Summe Gebote + Überschuss (negativ = Fehlbetrag)
  const summeGebote = runden(gebote.reduce((s, g) => s + g.betrag, 0));
  const rohUeberschuss = runden(summeGebote - gesamtkosten);
  const istFehlbetrag = rohUeberschuss < 0;

  // 3. Erster Pass: richtwertAnteil + ueberRichtwert pro Gebot
  const mitUeberRichtwert = gebote.map((g) => {
    const richtwertAnteil = runden(g.gewichtung * richtwert);
    const ueberRichtwert = runden(Math.max(0, g.betrag - richtwertAnteil));
    return { ...g, richtwertAnteil, ueberRichtwert };
  });

  const summeUeberRichtwert = runden(
    mitUeberRichtwert.reduce((s, g) => s + g.ueberRichtwert, 0),
  );

  // 4. Zweiter Pass: geldZurueck + solidarischerBeitrag
  const ergebnisse: GebotErgebnis[] = mitUeberRichtwert.map((g) => {
    let geldZurueck = 0;
    if (!istFehlbetrag && g.ueberRichtwert > 0 && summeUeberRichtwert > 0) {
      geldZurueck = runden((g.ueberRichtwert / summeUeberRichtwert) * rohUeberschuss);
    }
    const solidarischerBeitrag = runden(g.betrag - geldZurueck);
    return {
      emojiId: g.emojiId,
      slotLabel: g.slotLabel,
      gewichtung: g.gewichtung,
      gebot: g.betrag,
      richtwertAnteil: g.richtwertAnteil,
      ueberRichtwert: g.ueberRichtwert,
      geldZurueck,
      solidarischerBeitrag,
      ...(g.istStandard ? { istStandard: true } : {}),
    };
  });

  // 5. Rundungskorrektur: Differenz auf letzten Slot mit ueberRichtwert > 0 anwenden
  if (!istFehlbetrag && ergebnisse.length > 0) {
    const summeBerechnete = runden(
      ergebnisse.reduce((s, e) => s + e.solidarischerBeitrag, 0),
    );
    const delta = runden(summeBerechnete - gesamtkosten);
    if (delta !== 0) {
      const rueckwaerts = [...ergebnisse].reverse().findIndex((e) => e.ueberRichtwert > 0);
      const idx =
        rueckwaerts >= 0 ? ergebnisse.length - 1 - rueckwaerts : ergebnisse.length - 1;
      ergebnisse[idx].geldZurueck = runden(ergebnisse[idx].geldZurueck + delta);
      ergebnisse[idx].solidarischerBeitrag = runden(
        ergebnisse[idx].solidarischerBeitrag - delta,
      );
    }
  }

  const summeBeitraege = runden(
    ergebnisse.reduce((s, e) => s + e.solidarischerBeitrag, 0),
  );
  const fehlbetrag = Math.max(0, runden(gesamtkosten - summeBeitraege));

  return {
    richtwert,
    gesamtkosten,
    summeGebote,
    summeBeitraege,
    fehlbetrag,
    ueberschuss: Math.max(0, rohUeberschuss),
    ergebnisse,
  };
}

/**
 * Berechnet Ausgleichszahlungen (minimale Anzahl Überweisungen).
 *
 * Nur sinnvoll wenn:
 * - Ausgaben bekannt (ausgabenProSlot.size > 0)
 * - Kein Fehlbetrag (alle Kosten gedeckt)
 *
 * Algorithmus: Greedy-Schuldenminimierung.
 * Schuldner (nochZuZahlen > 0) überweisen an Gläubiger (nochZuZahlen < 0),
 * jeweils den kleinstmöglichen Betrag, um beide Seiten zu begleichen.
 */
export function berechneAusgleich(
  ergebnisse: GebotErgebnis[],
  ausgabenProSlot: Map<string, number>,
): Ausgleichszahlung[] {
  // Netto-Bilanz pro Person berechnen (synthetische Einträge überspringen)
  type Posten = { emojiId: string; betrag: number };
  const schuldner: Posten[] = [];
  const glaeubiger: Posten[] = [];

  for (const e of ergebnisse) {
    if (e.istStandard) continue;
    const ausgaben = ausgabenProSlot.get(e.slotLabel) ?? 0;
    const nochZuZahlen = runden(e.solidarischerBeitrag - ausgaben);
    if (nochZuZahlen > 0.005) {
      schuldner.push({ emojiId: e.emojiId, betrag: nochZuZahlen });
    } else if (nochZuZahlen < -0.005) {
      glaeubiger.push({ emojiId: e.emojiId, betrag: -nochZuZahlen });
    }
  }

  // Absteigend sortieren
  schuldner.sort((a, b) => b.betrag - a.betrag);
  glaeubiger.sort((a, b) => b.betrag - a.betrag);

  const zahlungen: Ausgleichszahlung[] = [];

  let si = 0;
  let gi = 0;
  while (si < schuldner.length && gi < glaeubiger.length) {
    const s = schuldner[si];
    const g = glaeubiger[gi];
    const transfer = runden(Math.min(s.betrag, g.betrag));
    zahlungen.push({ von: s.emojiId, an: g.emojiId, betrag: transfer });
    s.betrag = runden(s.betrag - transfer);
    g.betrag = runden(g.betrag - transfer);
    if (s.betrag <= 0.005) si++;
    if (g.betrag <= 0.005) gi++;
  }

  return zahlungen;
}
