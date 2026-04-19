---
description: Starte die Umsetzung eines ready-Issues — Branch anlegen, Kontext laden, mit Implementierung beginnen
argument-hint: [issue-nummer]
---

# Issue Start Command

Starte die Umsetzung von GitHub Issue #$ARGUMENTS.

## Schritt 1: Issue laden

Lies Issue #$ARGUMENTS aus GitHub. Prüfe:
- Hat es das `ready`-Label? Falls nicht, weise den Nutzer darauf hin und stoppe.
- Extrahiere: Titel, Problembeschreibung, Acceptance Criteria, betroffene Dateien, Label.

## Schritt 2: Branch anlegen

Erstelle einen Feature-Branch nach dem Schema `feature/issue-{nr}-kurzbeschreibung`.
Die Kurzbeschreibung: lowercase, Bindestriche statt Leerzeichen, max. 4 Wörter, aus dem Issue-Titel ableiten.

```bash
git checkout -b feature/issue-$ARGUMENTS-kurzbeschreibung
```

Entferne das `ready`-Label vom Issue.

## Schritt 3: Kontext ausgeben

Gib eine kompakte Arbeitsgrundlage aus:

- **Ziel:** Ein Satz was danach anders ist
- **Acceptance Criteria:** Liste der Checkboxen aus dem Issue
- **Betroffene Dateien:** Aus dem Issue, ergänzt durch eigene Analyse des Repos
- **Abhängigkeiten:** Falls vorhanden

## Schritt 4: Plan erstellen und bestätigen

Erstelle einen konkreten Implementierungsplan (Datei für Datei, Schritt für Schritt).
Warte auf Bestätigung des Nutzers, bevor du mit dem Coden anfängst.
