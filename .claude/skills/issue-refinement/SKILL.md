---
name: issue-refinement
description: Definition of Ready und Acceptance-Criteria-Stil für fairshare-zk Issues
user-invocable: false
---

# Issue Refinement — fairshare-zk

## Definition of Ready

Ein Issue ist bereit wenn:
- [ ] Ziel klar: Was ist danach anders?
- [ ] Acceptance Criteria als Checkboxen formuliert
- [ ] Scope passt in einen PR (~100–150 Zeilen)
- [ ] Kein offener Designentscheid
- [ ] Abhängigkeiten zu anderen Issues benannt
- [ ] Betroffene Dateien identifiziert (soweit bekannt)

## Acceptance Criteria — Stil

Konkret und prüfbar — nicht „funktioniert korrekt", sondern messbar:
- src/lib/solidarisch.ts gibt bei leerem Input einen Fehler zurück
- Kein console.log in src/ vorhanden
- Vitest-Tests sind grün

## Besonderheiten je Label

**`bug`** — Ist-Zustand + Soll-Zustand + Reproduktionsschritte
**`security`** — Bedrohungsmodell nennen, Bezug zum Zero-Knowledge-Prinzip
**`test`** — Datei/Funktion + zu testende Szenarien (Happy Path, Edge Cases, Fehler)
**`chore`** — Kein neues Verhalten, nur messbare Qualitätsverbesserung
**`feature`** — Nutzen aus User-Perspektive, Abhängigkeiten explizit  

## Was NICHT in den Issue gehört

- Implementierungsdetails (wie gebaut wird — entscheidet Claude)
- Infos die bereits in CLAUDE.md, TECH.md oder ANFORDERUNGEN.md stehen


