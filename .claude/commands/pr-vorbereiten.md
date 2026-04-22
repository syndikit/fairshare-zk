---
description: PR erstellen und reviewen — kein Merge, wartet auf User-Bestätigung
argument-hint: [pr-titel oder leer]
---

# PR Vorbereiten

Erstelle einen Pull Request für den aktuellen Branch und reviewe ihn. Kein Merge — warte danach auf Anweisung des Nutzers.

## Schritt 1: Status prüfen

```bash
git status
git log main..HEAD --oneline
```

Stelle sicher, dass alle Commits gepusht sind:

```bash
git push -u origin HEAD
```

## Schritt 2: PR erstellen

Analysiere alle Commits seit main (`git diff main...HEAD`) und erstelle den PR:

```bash
gh pr create --title "..." --body "$(cat <<'EOF'
## Summary
- ...

## Test plan
- [ ] ...

Closes #NR

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- Titel: kurz (unter 70 Zeichen), Conventional-Commits-Stil (feat/fix/…)
- Labels aus dem zugehörigen Issue übernehmen (falls vorhanden)
- `Closes #NR` aus dem Branch-Namen ableiten (z. B. `feature/issue-42-…` → `Closes #42`)

## Schritt 3: Review durchführen

Führe `/review` auf dem soeben erstellten PR aus.

## Schritt 4: Stopp — auf User warten

Gib die PR-URL aus und warte auf die Anweisung des Nutzers.
Führe **keinen Merge** durch — dafür gibt es `/pr-merge`.
