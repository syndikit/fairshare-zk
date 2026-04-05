# CLAUDE.md — FairShare (Zero-Knowledge)

## Projekt

Eine Web-App für solidarische Gruppenfinanzierung mit Zero-Knowledge-Prinzip.
Alle Inhalte werden im Browser verschlüsselt — der Server sieht nie Klartext.
Details in ANFORDERUNGEN.md und TECH.md.

---

## Setup: Visuelles Design aus dem Vorgängerprojekt

Das neue Projekt soll visuell identisch mit dem Vorgängerprojekt `syndikit/fairshare`
aussehen. Im Ordner `input/` liegen alle relevanten Dateien aus dem alten Projekt.
Übernimm beim initialen Setup folgende Dateien **unverändert**:

| Quelldatei (`input/`) | Ziel im neuen Projekt |
|---|---|
| `tailwind.config.mjs` | `tailwind.config.mjs` |
| `src/styles/global.css` | `src/styles/global.css` |
| `src/layouts/Layout.astro` | `src/layouts/Layout.astro` |
| `public/syndikit-c-icon.svg` | `public/syndikit-c-icon.svg` |
| `public/syndikit-c-logo.svg` | `public/syndikit-c-logo.svg` |

Die TypeScript-Typen aus `input/src/types/` dienen als **Referenz und Orientierung**,
werden aber nicht direkt kopiert — die Typen ändern sich durch die neue
Zero-Knowledge-Architektur grundlegend.

---

## Arbeitsweise

### Allgemein

- Lies zu Beginn jeder Session ANFORDERUNGEN.md und TECH.md
- Stelle Fragen bevor du Annahmen triffst
- Baue Schritt für Schritt — nicht alles auf einmal
- Nach jedem größeren Schritt: kurze Zusammenfassung was gemacht wurde, dann warten

### Sicherheit hat oberste Priorität

- **Kein Klartext auf dem Server** — das ist das Kernversprechen der App
- Niemals sensible Daten (Slots, Gebote, Namen, Beträge) unverschlüsselt
  an den Server senden
- Verschlüsselung findet **immer** im Browser statt, **vor** dem API-Aufruf
- Kein `console.log` mit Schlüsseln oder entschlüsselten Inhalten
- Nur WebCrypto API für Kryptografie — keine externen Krypto-Pakete
- HTTPS ist Pflicht
- Nach dem Laden eines Links: Fragment per `history.replaceState()` entfernen

### Planung

- Beginne jede neue Aufgabe mit einem kurzen Arbeitsplan
- Warte auf mein OK bevor du anfängst zu bauen
- Wenn etwas unklar ist: frage, baue nicht drauflos

### Git & Branches

- MVP 0 und MVP 1 werden auf `main` entwickelt
- Ab Feature 1: eigener Branch pro Feature
- Branch-Format: `feature/kurze-beschreibung` (Deutsch)
- Commits auf Englisch, klein und präzise
- Beispiele: `add webcrypto aes-gcm wrapper`, `add teilnehmer gebot form`

### Codequalität

- Code ist sauber, verständlich, wartbar und konsistent
- Krypto-Logik ausschließlich in `src/lib/crypto.ts` — nie inline
- Die App speichert keine personenbezogenen Daten — Grundprinzip, kein Nice-to-have
- DSGVO-Konformität von Anfang an, nicht nachträglich
- Tailwind Design Tokens statt Inline-Styles

### Tests

- Definiere Tests zuerst und zeige sie mir — bevor du sie ausführst
- `crypto.ts` bekommt Roundtrip-Tests für jeden Primitive
- `solidarisch.ts` bekommt Unit-Tests mit bekannten Eingaben und Erwartungen
- Kein PR ohne grüne Tests
- Tests prüfen auch Codequalität wo sinnvoll

### Pull Requests

- PR erst öffnen wenn ich explizit „fertig" oder „PR erstellen" sage
- PR-Beschreibung auf Deutsch
- PR enthält: Was wurde gebaut, wie wurde getestet, was kommt als nächstes

### Kommunikation

- Antworte auf Deutsch
- Kurze Zusammenfassungen — kein Roman
- Bei Fehlern: Problem erklären, Lösungsvorschlag machen, auf OK warten

---

## Agiler Workflow

### MVP 0 — Crypto-Fundament

1. Ich sage „starte MVP 0"
2. Du zeigst den Arbeitsplan — ich sage OK
3. Du baust `crypto.ts`
4. Du zeigst die Tests — ich sage OK
5. Du führst Tests aus
6. Ich gebe frei → Push auf `main`

### MVP 1 — Kern-Workflow

1. Ich sage „starte MVP 1"
2. Du zeigst den Arbeitsplan — ich sage OK
3. Du baust Schritt für Schritt (erst API, dann Seiten)
4. Du zeigst Tests — ich sage OK
5. Du führst Tests aus
6. Ich gebe frei → Push auf `main`

### Features (ab Feature 1)

1. Ich beschreibe das Feature
2. Du erstellst Branch `feature/...`
3. Arbeitsplan → OK → Bauen → Tests zeigen → OK → Tests ausführen → Freigabe → PR

Für die vollständige Feature-Liste: BACKLOG.md

---

## Was ich selbst mache

- PRs reviewen und mergen auf GitHub.com
- Entscheidungen über Anforderungsänderungen
- Freigabe von Tests und PRs
