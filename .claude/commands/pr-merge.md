# PR Merge & Sync

Merge einen Pull Request und synchronisiere main lokal.

## Workflow

PR-Nummer: $ARGUMENTS

Falls keine PR-Nummer angegeben, zeige zuerst die offenen PRs:

!gh pr list

Dann:

1. Lokalen Feature-Branch pushen, damit alle Commits auf GitHub sind:
   `git push`

2. PR squash-mergen und Remote-Branch löschen:
   `gh pr merge <nr> --squash --delete-branch`

3. Lokalen main auschecken und pullen:
   `git checkout main && git pull`

4. Kurze Bestätigung: welcher PR gemergt wurde, aktueller HEAD-Commit.

5. Lokale Branches aufräumen:
   - `git fetch --prune` — entfernt veraltete Remote-Tracking-Referenzen für gelöschte Remote-Branches
   - `git branch --merged main` — listet lokale Branches, die Git als literalen Vorfahren von main erkennt (klassischer Merge). Diese direkt löschen: `git branch -D <branch>`
   - Für alle übrigen lokalen Branches (nicht in `--merged`, meist wegen Squash-Merge nicht als Vorfahre erkennbar): mit `gh pr list --state all --head <branch> --json state,mergedAt` prüfen, ob der zugehörige PR gemerged wurde. Falls ja: löschen.
   - Für Branches ganz ohne zugehörigen PR: Inhalt gegen main prüfen (`git diff main...<branch>`). Nur löschen, wenn der Inhalt bereits in main enthalten oder erkennbar überholt ist — sonst dem Nutzer vorlegen und einzeln bestätigen lassen, nicht pauschal per Bulk-Befehl.
