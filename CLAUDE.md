# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app does

FairShare is a German-language web app for solidarische (solidarity-based) group cost-sharing. Participants submit anonymous sealed bids for what they can afford. An admin views aggregated results and calculates fair shares via a "Richtwert" (reference value per weighted unit). All sensitive data is encrypted in the browser — the server never sees amounts or identities.

## Architecture

**Framework:** Astro 5 (SSR, Node.js adapter, standalone mode)  
**Storage:** Filesystem JSON in `data/runden/*.json` — no database  
**Crypto:** Native WebCrypto API only (no npm crypto packages)  
**Testing:** Vitest in Node.js environment  
**Path alias:** `@/*` → `src/*`

### Key source files

| File | Purpose |
|------|---------|
| `src/lib/crypto.ts` | All encryption primitives (AES-GCM, ECDH, HMAC) |
| `src/lib/solidarisch.ts` | Core Richtwert calculation algorithm |
| `src/lib/splid.ts` | Splid XLSX import parser |
| `src/lib/storage.ts` | Browser localStorage management |
| `src/pages/neu.astro` | Round creation (key generation happens here) |
| `src/pages/runde/[id].astro` | Participant view (decrypt blob, submit bid) |
| `src/pages/runde/[id]/admin/[token].astro` | Admin results view |
| `src/pages/api/runde/` | REST API endpoints (create, blob, gebot) |

### Zero-knowledge design

Three keys are generated client-side and never sent to the server:

- **partKey** (AES-256-GCM): encrypts the round blob (name, costs, slots, admin public key)
- **adminPrivKey** (ECDH P-256): decrypts individual bids — only the admin link holder can see amounts
- **hmacKey** (HMAC-SHA256): generates anonymous 3-emoji participant IDs

Keys live only in URL fragments (`#pk=...&bk=...`). The server stores encrypted ciphertext, bid count, and timestamps only.

Encryption formats:
- Blob: `<iv_b64url>.<ct_b64url>` (AES-GCM)
- Bids: `<ephemPubKey_b64url>.<iv_b64url>.<ct_b64url>` (ephemeral ECDH + HKDF → AES-GCM)

### Solidarisch calculation

- `Richtwert = gesamtkosten / Σ(gewichtung × anzahl)` across all slots
- Per bid: `richtwertAnteil = gewichtung × Richtwert`; `ueberRichtwert = max(0, bid − richtwertAnteil)`
- Surplus: proportionally refund overpayers. Deficit: no refund.
- `Ausgleichszahlungen`: greedy debt-settling (schuldner pay gläubiger minimum transfers)

## Language & conventions

- All UI copy, validation messages, and variable names are in German (e.g., `Richtwert`, `Gebot`, `Runde`, `Slot`, `Ausgleichszahlung`).
- TypeScript strict mode throughout.
- No linter — follow the style of surrounding code.
- Responsive/mobile-first with Tailwind 4; brand green is `#3B6D11`.
- Tailwind utility classes only — no inline styles, no custom CSS outside `src/styles/global.css`.
- Print styles in `src/styles/global.css` optimize the admin view for PDF export.

## Design-Prinzipien (UX)

- **Progressive Disclosure:** Komplexität erscheint erst, wenn sie gebraucht wird. Features werden nicht entfernt — sie werden zum richtigen Moment sichtbar.
- Kein Feature im primären Sichtbereich, das die meisten Nutzer nie brauchen.
- Power-Features sind auffindbar, aber nie aufdringlich.

## Git-Workflow

- Commits: English, Conventional Commits (feat/fix/refactor/chore/docs/test/style)
- **Separate commit per file** — never bundle multiple file changes into one commit
- Commit often — at least once per completed task
- Branch: `feature/issue-{nr}-kurzbeschreibung`
- PRs klein halten — ein Feature pro PR; immer mit `Closes #Nr`
- Vor dem Merge immer `/review` ausführen — kein Merge ohne abgeschlossenes Review
- Squash Merge beim Mergen in main
- Labels: feature, bug, chore, security, test, ready — vom Issue auf den PR übertragen; ready-Label vom Issue entfernen wenn Umsetzung beginnt

## Commands

```bash
npm run dev          # Start Astro dev server
npm run build        # Production build
npm run preview      # Preview production build
npm run test         # Run Vitest test suite once
npm run test:watch   # Run tests in watch mode
```

Node.js at `/opt/homebrew/opt/node.js/bin/` — use absolute paths if `node`/`npm` not in PATH.  
Single test file: `npx vitest run src/lib/solidarisch.test.ts`

## Vor der Umsetzung

Erstelle zuerst einen Plan und warte auf Bestätigung, bevor du mit dem Coden anfängst.
