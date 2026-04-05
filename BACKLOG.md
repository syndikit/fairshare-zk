# BACKLOG.md — Solidarische Haushaltskasse (Zero-Knowledge)

## MVP 0 — Crypto-Fundament

**Ziel:** Krypto-Schicht steht und ist vollständig getestet.
Kein Server, keine UI — nur `src/lib/crypto.ts` mit Tests.

- `generatePartKey()` → AES-256-GCM Schlüssel
- `generateAdminKeyPair()` → ECDH P-256 Schlüsselpaar
- `encrypt(data, partKey)` / `decrypt(blob, partKey)` → AES-GCM Roundtrip
- `encryptGebot(data, pubKey)` / `decryptGebot(blob, privKey)` → ECDH Roundtrip
- `hmac(emojiId, partKey)` → deterministischer Hash ohne Klartext
- `exportKey(key)` / `importPartKey(raw)` / `importPrivKey(raw)` / `importPubKey(raw)` → Base64url Serialisierung
- Roundtrip-Tests für jeden Primitive

---

## MVP 1 — Kern-Workflow

**Ziel:** Vollständiger Ablauf von Runde erstellen bis Auswertung.
Aufbaut auf dem getesteten Crypto-Fundament aus MVP 0.

- Seite „Neue Runde": Formular mit Name, Kosten, Slot-Typen (Label, Faktor, Anzahl)
- Schlüsselerzeugung im Browser → Admin-Link + Teilnehmer-Link anzeigen
- API `POST /api/runde/erstellen`: nimmt `encTeilnehmerBlob` + `adminToken` entgegen
- API `GET /api/runde/blob`: gibt `encTeilnehmerBlob` + `gebote[]` zurück
- API `POST /api/runde/gebot`: nimmt `emojiHmac` + `encGebot` entgegen
- Teilnehmer-Seite: Blob entschlüsseln, Slot-Typen anzeigen, Slot wählen, Betrag eingeben, Emoji-ID anzeigen
- Admin-Seite: Blob + Gebote laden, alles entschlüsseln, Auswertungstabelle, Druckansicht
- `src/lib/solidarisch.ts` mit Berechnungslogik + Unit-Tests

---

## Feature 1 — Splid-Import

**Warum:** Gruppen die Splid nutzen können ihre bestehenden Daten importieren
statt alles neu einzutippen.

**Verhalten:**
- Organisatorin lädt eine Splid-XLSX-Datei hoch (client-seitig, SheetJS)
- Personen und Ausgaben werden als Slot-Typen erkannt und ins Formular übernommen
- Runde wechselt automatisch in benannten Modus (Labels = Klarnamen)
- Import passiert vollständig im Browser — die Datei verlässt das Gerät nicht

**Abhängigkeit:** MVP 1

---

## Feature 2 — Gebot nachträglich korrigieren

**Warum:** Tippfehler passieren. Ohne diese Funktion ist ein falsches Gebot
nicht korrigierbar.

**Verhalten:**
- Teilnehmer öffnet die Runde erneut
- Gibt seine Emoji-ID ein zur Identifikation
- Browser berechnet HMAC → Server sucht passendes Gebot
- Neues Gebot wird verschlüsselt und ersetzt das alte
- Emoji-ID bleibt gleich

**Abhängigkeit:** MVP 1

---

## Feature 3 — Ausgleichszahlungen

**Warum:** Nach der Auswertung weiß jeder was er zahlen soll — aber nicht wem.

**Verhalten:**
- Browser berechnet Ausgleichszahlungen (minimale Anzahl Überweisungen)
- Darstellung: „🐼🚀🌈 überweist 🦊🌙⭐ → 23,50€"
- In Druckansicht enthalten
- Nur bei benannten Slots (mit Labels) sinnvoll

**Abhängigkeit:** MVP 1

---

## Feature 4 — Meine Runden

**Warum:** Ohne Speicherung muss die Organisatorin Admin-Link und
Teilnehmer-Link extern verwalten.

**Verhalten:**
- Beim Erstellen einer Runde: Links + Name werden in localStorage gespeichert
- „Meine Runden"-Seite zeigt alle gespeicherten Runden mit Status
- Templates speichern und wiederverwenden
- JSON-Export / -Import der gesamten localStorage-Daten für Backup

**Abhängigkeit:** MVP 1

---

## Feature 5 — Standardgebot pro Slot-Typ

**Warum:** Manche Slot-Typen haben einen fixen Anteil (z.B. Kinder zahlen
automatisch den Richtwert).

**Verhalten:**
- Pro Slot-Typ optional: Standardgebot aktivieren
- Teilnehmer sieht das vorausgefüllte Gebot und kann es überschreiben
- Standardwert steckt im `encTeilnehmerBlob` — kein Klartext

**Abhängigkeit:** MVP 1

---

## Feature 6 — Runde wiederholen

**Warum:** Bei Unterdeckung muss eine neue Runde gestartet werden.

**Verhalten:**
- „Runde wiederholen" nach Abschluss
- Neue Schlüssel werden generiert (neues partKey, neues ECDH-Paar)
- Slot-Typen aus vorheriger Runde übernommen, Gebote zurückgesetzt
- Neue Links generiert, optional Gesamtkosten anpassen

**Abhängigkeit:** Feature 4 (localStorage)

---

## Feature 7 — Landing Page

**Warum:** Erste Seite die jemand sieht. Macht die App sofort verständlich
und schafft Vertrauen durch Hinweis auf Zero-Knowledge-Prinzip.

**Inhalt:**
- Kurze Erklärung was die App macht
- Hinweis: „Der Server sieht nie deine Daten"
- Button: „Neue Runde erstellen"

**Abhängigkeit:** MVP 1

---

## Feature 8 — Diagramme

**Warum:** Visuelle Darstellung macht die solidarische Logik verständlicher.

**Inhalt:**
- Balken pro Slot: Gebot vs. solidarischer Beitrag
- Gesamtübersicht: Zielkosten vs. tatsächliche Einnahmen
- Nur in der Admin-Ansicht (Daten sind entschlüsselt)

**Abhängigkeit:** MVP 1

---

## Nicht geplant

- Server-seitige Sync-ID / geräteübergreifende Synchronisation
  → ersetzt durch JSON-Export/-Import (Feature 4)
- Admin-Authentifizierung via Login / Passwort
  → Token-URL + Schlüssel im Fragment sind ausreichend
- E-Mail-Benachrichtigungen
  → widerspricht dem Anonymitätsprinzip ohne sorgfältige Abwägung
- Server-seitige Berechnung
  → Berechnung findet ausschließlich im Browser statt
