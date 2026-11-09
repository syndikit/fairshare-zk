# fairshare-zk
SyndiKit · Fairshare – Solidarische Haushaltskasse mit Zero-Knowledge-Ansatz

FairShare hilft Gruppen, Kosten solidarisch aufzuteilen: Jede Person gibt anonym an, was sie beitragen kann. Ein **Richtwert** zeigt, was ein „fairer Anteil" wäre — wer mehr kann, gibt mehr, wer weniger kann, gibt weniger. Beträge und Namen werden im Browser verschlüsselt; der Server sieht davon nichts.

---

## Inhalt

- [Schnellstart](#schnellstart)
- [Import aus Splid](#import-aus-splid)
- [Modi: Standard, Drei-Gebot, (Teil-)Deckung](#modi)
- [Wie gerechnet wird](#wie-gerechnet-wird)
- [Datenschutz in Kürze](#datenschutz-in-kürze)
- [Für Entwickler:innen](#für-entwicklerinnen)

---

## Schnellstart

### 1. Runde erstellen

Auf der Startseite **„Neue Runde erstellen"** wählen und ausfüllen:

- **Name der Runde** – z. B. „Haushaltskasse Oktober"
- **Gesamtkosten** – der Betrag, der insgesamt gedeckt werden soll
- **Personen** – ein Eintrag pro Person (oder pro Gruppe gleichartiger Personen)

Unter **„Erweitert"** bei jeder Person:

| Einstellung | Bedeutung |
|---|---|
| **Gewichtung** | Wie stark die Person in den Richtwert eingeht. *Erwachsen* = 1,0, *Kind* = 0,25, oder *Manuell* ein eigener Wert (z. B. 0,75 für ermäßigt). |
| **Anzahl** | Wie viele Personen sich diesen Eintrag teilen. „Kinder" mit Anzahl 2 heißt: zwei Kinder, die jeweils einzeln bieten. |
| **Standardgebot** | Fester Betrag, der automatisch eingesetzt wird, wenn für diesen Platz niemand selbst bietet — praktisch für Kinder oder Personen, die nicht selbst teilnehmen. |

Über **„+ Ausgaben erfassen"** lässt sich pro Person eintragen, wie viel sie bereits ausgelegt hat (z. B. Einkäufe). Daraus berechnet FairShare am Ende, wer wem noch etwas überweisen muss.

Weitere Optionen (Modi, Import) liegen im Menü **„⋯"** oben rechts.

### 2. Links sichern und teilen

Nach dem Erstellen gibt es zwei Links — **sie werden nur einmal angezeigt**:

- **Teilnehmer:innen-Link** → an alle schicken, die mitbieten sollen.
- **Admin-Link** → nur für dich. Wer ihn hat, kann alle Gebote sehen. Nicht weitergeben.

Geöffnete Runden landen außerdem unter **„Meine Runden"** — allerdings nur auf diesem Gerät und in diesem Browser.

### 3. Bieten

Teilnehmende öffnen den Link, wählen ihren Platz (z. B. „Anna" oder „Erwachsen") und geben ihr Gebot ein. Der Richtwert für diesen Platz wird als Orientierung angezeigt.

Nach dem Abschicken erscheint eine **Emoji-ID** (z. B. 🦊🌙⭐). Damit kann man:

- das eigene Gebot später über **„Gebot korrigieren"** ändern,
- den eigenen Eintrag in der Auswertung wiederfinden.

Die Emoji-ID lässt sich per Tippen kopieren — gut aufheben.

### 4. Auswerten

Über den Admin-Link siehst du:

- den **Richtwert** pro Gewichtungseinheit,
- pro Gebot: Gebot, Richtwert-Anteil, **Geld zurück** und den endgültigen **solidarischen Beitrag**,
- **Ausgleichszahlungen** (wenn Ausgaben erfasst wurden): wer an wen wie viel überweist — mit möglichst wenigen Überweisungen,
- einen Status, ob noch Gebote fehlen oder die Kosten gedeckt sind.

Mit **„Als PDF drucken"** lässt sich das Ergebnis festhalten. **„Runde wiederholen"** legt eine neue Runde mit denselben Personen, Gewichtungen und Standardgeboten an — auf Wunsch auch mit den Ausgaben.

> **Hinweis:** Der Drei-Gebot- und der (Teil-)Deckungsmodus werden beim Wiederholen *nicht* übernommen und müssen im „⋯"-Menü neu eingeschaltet werden.

---

## Import aus Splid

Wer Ausgaben in [Splid](https://splid.app) sammelt, kann die Abrechnung direkt übernehmen, statt alles abzutippen.

### Schritt für Schritt

1. **In Splid exportieren:** In der Gruppe die Export-Funktion nutzen und die Abrechnung als **Excel-Datei** (`.xlsx` oder `.xls`) speichern.
2. **In FairShare importieren:** „Neue Runde erstellen" → Menü **„⋯"** → **„Abrechnung importieren"** → Datei auswählen.
   Die Datei wird nur im Browser gelesen und **nicht hochgeladen**.
3. **Ergebnis prüfen.** Übernommen werden:
   - **Rundenname** aus dem Gruppennamen,
   - **Gesamtkosten** als Summe aller Ausgaben,
   - **alle Personen** aus der Splid-Gruppe, jeweils mit ihren **Ausgaben**.
4. **Gewichtungen anpassen:** Alle importierten Personen starten mit Gewichtung *Erwachsen* (1,0) und Anzahl 1. Wer ermäßigt teilnimmt, bekommt unter „Erweitert" eine andere Gewichtung.
5. **Fehlende Personen ergänzen** (siehe unten).
6. **„Runde erstellen"** und wie gewohnt die Links teilen.

### ⚠️ Personen, die nicht in Splid vorkommen

Splid kennt nur Personen, die in der Splid-Gruppe angelegt sind. Wer dort fehlt — **typischerweise Kinder** —, taucht nach dem Import nicht auf.

**Diese Personen müssen bei jedem Import von Hand ergänzt werden:**

- Über **„+ Person hinzufügen"** einen Eintrag anlegen, z. B. „Kinder".
- Unter „Erweitert" die Gewichtung *Kind* (0,25) wählen und die **Anzahl** setzen.
- Optional ein **Standardgebot** festlegen, damit niemand für die Kinder extra bieten muss.

Der Import **ersetzt die komplette Personenliste**. Deshalb immer erst importieren und danach die zusätzlichen Personen eintragen — sonst werden sie überschrieben.

### Nach der Auswertung

Weil die Ausgaben aus Splid bekannt sind, zeigt die Auswertung zusätzlich **Ausgleichszahlungen**: Wer weniger ausgelegt hat, als der solidarische Beitrag beträgt, überweist an diejenigen, die mehr ausgelegt haben.

### Eigene Tabelle statt Splid

Statt eines Splid-Exports geht auch eine eigene CSV- oder XLSX-Datei mit diesen Spalten:

| Spalte | Pflicht | Beispiel |
|---|---|---|
| `Name` | ja | Erwachsene |
| `Ausgaben` | ja | 180.00 |
| `Gewichtung` | ja | 1.0 |
| `Anzahl` | ja | 3 |
| `Standardgebot` | nein | 30 |

Eine Beispieldatei gibt es über das **ⓘ** neben „Abrechnung importieren" oder direkt unter [`public/beispiel-basis-import.csv`](public/beispiel-basis-import.csv). Die Gesamtkosten ergeben sich aus der Summe der Ausgaben.

---

<a id="modi"></a>
## Modi: Standard, Drei-Gebot, (Teil-)Deckung

Der Modus wird beim Erstellen der Runde im Menü **„⋯"** gewählt. Drei-Gebot- und (Teil-)Deckungsmodus schließen sich gegenseitig aus.

### Standardmodus

Jede Person gibt **einen Betrag** an. Die Auswertung zeigt Ergebnisse erst, wenn **alle geboten haben und die Kosten gedeckt sind**. Vorher sieht auch der Admin nur, wie viele Gebote noch fehlen — so lassen sich einzelne Beträge nicht vorzeitig zuordnen.

Reichen die Gebote nicht aus, muss die Runde mit höheren Geboten wiederholt werden.

**Gut für:** Haushaltskasse, gemeinsame Einkäufe, Fahrtkosten, regelmäßige Umlagen — alles, wo ein fester Betrag sicher zusammenkommen muss.

### Drei-Gebot-Modus

Jede Person gibt **drei Beträge** an: ein **Minimal-**, ein **mittleres** und ein **Maximalgebot**. FairShare prüft dann, auf welcher Stufe die Kosten gedeckt sind, und wertet mit der niedrigsten passenden Stufe aus:

| Status | Bedeutung |
|---|---|
| 🟢 Grün | Schon die Minimalgebote decken die Kosten. |
| 🟡 Gelb | Erst die mittleren Gebote reichen. |
| 🔴 Rot | Erst die Maximalgebote reichen. |
| ⚫ Kritisch | Selbst die Maximalgebote reichen nicht. Die Auswertung nutzt sie als Näherung. |

**Gut für:** Situationen, in denen unklar ist, ob das Geld reicht — z. B. ein neues Projekt, eine größere Anschaffung oder ein knappes Budget. Statt im Fehlerfall eine zweite Runde zu starten, sagt jede Person gleich, wie weit sie notfalls gehen kann. Niemand zahlt mehr als nötig.

### (Teil-)Deckungsmodus

Die Beiträge sind für den Admin **sofort sichtbar** — auch wenn noch nicht alle geboten haben und auch dann, wenn die Summe die Kosten nicht deckt. Es gibt keine Pflicht, das Ziel zu erreichen: Der Rest wird anderweitig gedeckt.

- Ist das Ziel noch nicht erreicht, zeigt die Auswertung, **wie viel noch fehlt**.
- Ist das Ziel erreicht, sieht die Auswertung aus wie im Standardmodus — auch wenn nicht alle geboten haben. Ausgleichszahlungen gibt es erst ab diesem Punkt.

**Gut für:** alles, wo man **Zusagen oder Spenden einsammeln** will, statt einen festen Betrag aufzuteilen, zum Beispiel:

- **interne Direktkredit-Angebote** sammeln: Wer kann wie viel geben, und wie nah kommen wir an die benötigte Summe?
- **Spenden bei Mietausfall** oder einem anderen Engpass: Jede:r gibt, was geht; der Rest kommt aus Rücklagen oder anderen Quellen.
- freiwillige Beiträge für ein gemeinsames Vorhaben, bei dem nicht alle mitmachen müssen.

> **Hinweis:** Weil Beiträge sofort sichtbar sind, kann der Admin bei wenigen Geboten eher erraten, wer was geboten hat — etwa, wenn kurz nach einer Nachricht genau ein neues Gebot eingeht. In kleinen Gruppen lohnt es sich, das vorher offen anzusprechen.

---

## Wie gerechnet wird

1. **Richtwert** = Gesamtkosten ÷ Summe aller Gewichtungen (Gewichtung × Anzahl, über alle Personen).
   Beispiel: 1.000 € Kosten, 3 Erwachsene (3 × 1,0) und 2 Kinder (2 × 0,25) → 1.000 € ÷ 3,5 ≈ **285,72 €** pro Erwachsenem, **71,43 €** pro Kind.
2. **Richtwert-Anteil** pro Person = Gewichtung × Richtwert.
3. **Überschuss** (Gebote > Kosten): Wer über dem eigenen Richtwert-Anteil geboten hat, bekommt den Überschuss anteilig zurück. Wer darunter bleibt, zahlt genau das eigene Gebot.
4. **Fehlbetrag** (Gebote < Kosten): Es gibt kein Geld zurück. Im Standardmodus muss die Runde wiederholt werden, im (Teil-)Deckungsmodus wird der Fehlbetrag angezeigt.
5. **Ausgleichszahlungen:** Aus solidarischem Beitrag minus eigenen Ausgaben ergibt sich, wer noch zahlen muss und wer Geld bekommt. FairShare schlägt dafür möglichst wenige Überweisungen vor.

---

## Datenschutz in Kürze

- Alle Inhalte (Namen, Beträge, Personen) werden **im Browser verschlüsselt**, bevor sie den Server erreichen.
- Die Schlüssel stecken im Link hinter dem `#` — dieser Teil wird nie an den Server geschickt.
- Teilnehmende sehen keine Gebote anderer. Nur wer den Admin-Link hat, kann Gebote lesen.
- Es gibt keine Konten, keine E-Mail-Adressen und keine Namen von Teilnehmenden. Runden werden nach 6 Monaten automatisch gelöscht.

Was der Server trotzdem sehen kann (z. B. Anzahl und Zeitpunkt der Gebote), steht auf der Startseite unter „Wie es funktioniert".

---

## Für Entwickler:innen

Astro 5 (SSR, Node-Adapter), Tailwind 4, Vitest. Kryptografie ausschließlich über die WebCrypto-API.

```bash
npm install
npm run dev          # Dev-Server starten
npm run build        # Produktions-Build
npm run preview      # Build lokal ansehen
npm run test         # Tests einmal ausführen
npm run test:watch   # Tests im Watch-Modus
```

Architektur, Konventionen und Workflow stehen in [`CLAUDE.md`](CLAUDE.md).
