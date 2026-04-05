# Solidarische Haushaltskasse — Anforderungen

## Ziel der Anwendung

Die App ermöglicht es Gruppen, eine gemeinsame Haushaltskasse solidarisch und
gerecht zu finanzieren – ohne Zwang zu fixen Beiträgen. Eine Organisatorin
erstellt eine Runde, Teilnehmer geben Gebote ab, und die App berechnet faire
Beiträge nach solidarischer Logik.

Das zentrale Designprinzip ist **Zero-Knowledge**: Alle sensiblen Inhalte
werden ausschließlich im Browser verschlüsselt und entschlüsselt. Der
Server-Betreiber kann zu keinem Zeitpunkt Inhalte lesen.

## Nutzungsszenarien

- Wohngemeinschaften
- Familien
- Kollektive / Hausprojekte
- Gemeinsame Initiativen (Einkäufe, Reparaturen, Feste etc.)

---

## Ablauf

### Phase 1 — Organisatorin erstellt eine Runde

- Gibt der Runde einen Namen (z.B. „Haushaltskasse Oktober")
- Definiert die Gesamtkosten
- Legt Slot-Typen an — jeder Typ hat:
  - Ein Label (z.B. „Familie", „Student", „Kind 1") — optional, sonst „Slot"
  - Eine Gewichtung (z.B. 1.0, 0.5, 2.5)
  - Eine Anzahl (wie viele Plätze dieses Typs es gibt)
- Bekommt zwei Links:
  - **Teilnehmer-Link** — zum Teilen mit der Gruppe (enthält `partKey`)
  - **Admin-Link** — nur für sie (enthält `partKey` + `adminPrivKey`)
- Beide Links werden lokal in „Meine Runden" gespeichert *(ab Feature 4)*

### Phase 2 — Teilnehmer geben Gebote ab

- Öffnen den Teilnehmer-Link
- Der Browser entschlüsselt die Slot-Anzeige lokal mit dem Schlüssel aus dem Link
- Sehen die verfügbaren Slot-Typen (Label + Gewichtung)
- Wählen ihren Slot-Typ
- Geben ihren Geldbetrag ein
- Bekommen eine Emoji-ID angezeigt — drei zufällige Emojis, z.B. 🐼🚀🌈
- Das Gebot wird im Browser mit dem öffentlichen Schlüssel des Admins
  verschlüsselt — nur der Admin kann es lesen
- Die Emoji-ID ist ihr persönlicher Beleg

### Phase 3 — Organisatorin wertet aus

- Öffnet den Admin-Link
- Der Browser entschlüsselt alle Gebote lokal mit dem privaten Schlüssel
- Auswertung wird vollständig im Browser berechnet:
  - Richtwert pro Gewichtseinheit
  - Solidarische Beiträge pro Slot
  - Ausgleichszahlungen *(ab Feature 3)*
  - Fehlbetrag oder Überschuss
- Druckansicht öffnen → `window.print()` → PDF

---

## Slot-Typen

Jede Runde besteht aus einer Liste von Slot-Typen. Mehrere Personen können
denselben Typ wählen (z.B. 7 × Faktor 1.0). Das Label macht Typen eindeutig,
auch wenn der Faktor gleich ist.

**Beispiel-Konfigurationen:**

```
[7 × "Slot" Faktor 1.0,  1 × "Kind 1" Faktor 0.25,  1 × "Kind 2" Faktor 0.5]
[3 × "Erwachsene" Faktor 1.0,  2 × "Familie" Faktor 2.5]
```

Es gibt keinen separaten „anonymen" oder „nicht-anonymen" Modus:
- Ohne Namen als Labels → anonyme Runde
- Mit Namen als Labels (oder via Splid-Import) → nicht-anonyme Runde

---

## Solidarische Berechnungslogik

- Richtwert = Gesamtkosten ÷ Summe aller Gewichtungen aller belegten Slots
- Wer weniger als seinen Richtwert-Anteil bietet, zahlt nur das Gebot
- Wer mehr bietet, wird anteilig reduziert falls das Gesamtbudget sonst
  überschritten wird
- Ergebnis: faires, transparentes und solidarisches System

---

## Auswertungstabelle

| Emoji-ID | Label | Gewichtung | Gebot | Solidarischer Beitrag | Differenz |
|---|---|---|---|---|---|
| 🐼🚀🌈 | Familie | 2.0 | 80€ | 75€ | +5€ |
| 🦊🌙⭐ | Student | 0.5 | 15€ | 18€ | -3€ |

Zusätzliche Informationen:
- Richtwert pro Gewichtseinheit
- Summe aller Gebote
- Summe aller solidarischen Beiträge
- Fehlbetrag oder Überdeckung

---

## Datenschutz & Zero-Knowledge

- Keine Klarnamen erforderlich (außer bei bewusstem Splid-Import ab Feature 1)
- Emoji-ID: drei zufällige Emojis aus einer Liste von 50 positiven Emojis
  (50³ = 125.000 mögliche Kombinationen)
- Alle Inhalte werden im Browser verschlüsselt bevor sie den Server verlassen
- Der Server-Betreiber sieht nur: Runden-IDs und Anzahl der Gebote
- Keine Cookies, kein Tracking, keine Registrierung, kein Login
- Datenhaltung auf EU-Server (Hetzner)
- Schlüssel werden ausschließlich im URL-Fragment transportiert — dieses wird
  vom Browser per Spezifikation niemals an den Server gesendet

---

## MVP 0 — Crypto-Fundament

**Ziel:** Krypto-Schicht steht, ist getestet, bevor irgendeine UI entsteht.

- `crypto.ts` mit allen WebCrypto-Wrappern (AES-GCM, ECDH, HMAC)
- Schlüssel generieren, serialisieren, deserialisieren
- Roundtrip-Tests für jeden Primitive (encrypt → decrypt)
- Kein Server, keine UI

## MVP 1 — Kern-Workflow

**Ziel:** Vollständiger Ablauf von Runde erstellen bis Auswertung.
Aufbaut auf dem getesteten Crypto-Fundament aus MVP 0.

- Runde erstellen (Name, Kosten, Slot-Typen mit Label, Faktor, Anzahl)
- Schlüsselerzeugung im Browser → Admin-Link + Teilnehmer-Link
- Teilnehmer-Seite: Slots entschlüsseln, Slot wählen, Gebot abgeben, Emoji-ID
- Admin-Seite: Gebote entschlüsseln, Auswertungstabelle, Druckansicht

**Nicht im MVP:**
- Splid-Import, Gebot korrigieren, Ausgleichszahlungen
- Meine Runden, Templates, JSON-Export

---

## Feature-Übersicht

| Feature | Inhalt |
|---|---|
| **MVP 0** | Crypto-Fundament + Tests |
| **MVP 1** | Kern-Workflow (Erstellen → Gebot → Auswertung) |
| **Feature 1** | Splid-XLSX-Import |
| **Feature 2** | Gebot nachträglich korrigieren |
| **Feature 3** | Ausgleichszahlungen |
| **Feature 4** | „Meine Runden" (localStorage) + Templates + JSON-Export/-Import |
| **Feature 5** | Standardgebot pro Slot-Typ |
| **Feature 6** | Runde wiederholen |
| **Feature 7** | Landing Page |
| **Feature 8** | Diagramme |
