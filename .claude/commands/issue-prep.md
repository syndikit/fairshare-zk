---
description: Mache ein refinement eines GitHub Issue für fairshare-zk und setze es auf "ready", wenn die definition of ready erfüllt ist
argument-hint: [issue-nummer]
---

# Issue Prep Command

Arbeite GitHub Issue #$ARGUMENTS aus, bis es die Definition of Ready erfüllt.

## Workflow

### Schritt 1: Issue-Inhalt erfassen
Lies den aktuellen Issue-Titel und die vorhandene Beschreibung aus GitHub.
Falls kein GitHub-Zugriff möglich ist, frage den Nutzer nach dem Inhalt.

### Schritt 2: Rückfragen stellen (nur wenn nötig)
Lade den Skill @issue-refinement.

Analysiere ob der Issue bereits klar genug ist. Stelle offene Fragen —
maximal 3, einzeln nacheinander, nicht alle auf einmal.

### Schritt 3: Issue-Text formulieren
Schreibe den fertigen Issue-Text mit:
- Kurze Problembeschreibung (1–3 Sätze)
- Acceptance Criteria als Checkboxen
- Betroffene Dateien (soweit bekannt)
- Abhängigkeiten zu anderen Issues (falls vorhanden)
- Label-Vorschlag

### Schritt 4: Ready-Bewertung
Bewerte abschließend: Kann das `ready`-Label gesetzt werden?
Falls nicht — benenne konkret was noch fehlt.
