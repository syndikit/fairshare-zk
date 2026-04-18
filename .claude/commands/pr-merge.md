# PR Merge & Sync

Merge einen Pull Request und synchronisiere main lokal.

## Workflow

PR-Nummer: $ARGUMENTS

Falls keine PR-Nummer angegeben, zeige zuerst die offenen PRs:

!gh pr list

Dann:

1. PR squash-mergen und Remote-Branch löschen:
   `gh pr merge <nr> --squash --delete-branch`

2. Lokalen main auschecken und pullen:
   `git checkout main && git pull`

3. Kurze Bestätigung: welcher PR gemergt wurde, aktueller HEAD-Commit.
