# TECH.md — Tech Stack & Architektur

## Stack

| Komponente | Technologie | Begründung |
|---|---|---|
| Framework | Astro + TypeScript | Modern, schlank, SSR eingebaut |
| Styling | Tailwind CSS | Standard, wenig eigenes CSS |
| Backend | Astro API Routes | Kein separates Backend nötig |
| Datenspeicher | JSON-Dateien | Keine Datenbank, einfach zu maintainen |
| Kryptografie | WebCrypto API (nativ) | Kein npm-Paket, kein Supply-Chain-Risiko |
| Hosting | Hetzner (Deutschland) | DSGVO-konform, EU |
| CI/CD | GitHub Actions | Automatisches Deployment bei Push |
| Runtime | Node.js Adapter | Für SSR auf Hetzner nötig |

**Crypto-Abhängigkeiten: keine.** Ausschließlich native WebCrypto API des
Browsers — kein externes Krypto-Paket, kein npm-Paket für Verschlüsselung.

---

## Zero-Knowledge-Architektur

### Schlüssel

```
partKey      Zufälliger AES-256-GCM Schlüssel   → verschlüsselt Teilnehmer-Blob
adminPrivKey Zufälliger ECDH P-256 Private Key  → entschlüsselt Gebote
adminPubKey  Abgeleitet von adminPrivKey         → steckt im Teilnehmer-Blob
```

### Schlüsseltransport via URL-Fragment

```
Admin-Link:       /runde/[id]/admin/[token]#pk=[partKey]&bk=[adminPrivKey]
Teilnehmer-Link:  /runde/[id]#pk=[partKey]
```

Das `#`-Fragment wird vom Browser per RFC 3986 **niemals** an den Server
gesendet. Es erscheint nicht in Server-Logs. Nach dem ersten Laden wird es
per `history.replaceState()` aus der Browser-History entfernt.

### Was der Server speichert

```json
{
  "id": "abc123",
  "adminToken": "xyz789",
  "encTeilnehmerBlob": "<AES-GCM verschlüsselt>",
  "gebote": [
    { "emojiHmac": "sha256-hash", "encGebot": "..." }
  ]
}
```

Mehr nicht. Kein Klartext außer der technischen ID.

### Was womit verschlüsselt wird

| Inhalt | Schlüssel | Algorithmus | Wer kann lesen |
|---|---|---|---|
| `encTeilnehmerBlob` (Slots, Labels, Faktoren, adminPubKey) | `partKey` | AES-GCM 256 | Alle mit Teilnehmer-Link + Admin |
| `gebote[]` (Betrag, Emoji-ID, Slot-Label) | `adminPubKey` | ECDH P-256 | Nur Admin |

---

## Projektstruktur

```
/
├── src/
│   ├── pages/
│   │   ├── index.astro              # Startseite (ab Feature 7)
│   │   ├── neu.astro                # Runde erstellen
│   │   └── runde/
│   │       ├── [id].astro           # Teilnehmer-Seite
│   │       └── admin/
│   │           └── [token].astro    # Admin-Seite
│   ├── api/
│   │   └── runde/
│   │       ├── erstellen.ts         # POST: neue Runde anlegen
│   │       ├── gebot.ts             # POST: verschlüsseltes Gebot speichern
│   │       ├── gebot-ersetzen.ts    # PUT: Gebot per emojiHmac ersetzen (Feature 2)
│   │       └── blob.ts              # GET: encTeilnehmerBlob + gebote[] laden
│   └── lib/
│       ├── crypto.ts                # WebCrypto-Wrapper (AES-GCM, ECDH, HKDF, HMAC)
│       ├── solidarisch.ts           # Berechnungslogik
│       ├── splid.ts                 # XLSX-Import (SheetJS) — ab Feature 1
│       └── storage.ts               # localStorage — ab Feature 4
├── data/
│   └── runden/                      # Eine JSON-Datei pro Runde
├── public/
└── astro.config.mjs
```

---

## Server-Datenmodell

### Runde (eine JSON-Datei pro Runde)

```json
{
  "id": "abc123",
  "adminToken": "xyz789",
  "encTeilnehmerBlob": "...",
  "gebote": [
    {
      "emojiHmac": "sha256-hash",
      "encGebot": "..."
    }
  ]
}
```

**Kein `name`, kein `gesamtkosten`, kein `status`, keine `slots` im Klartext.**
Alles steckt im `encTeilnehmerBlob`.

---

## Crypto-Primitive (WebCrypto API)

```typescript
// AES-GCM: Teilnehmer-Blob verschlüsseln / entschlüsseln
async function encrypt(data: object, key: CryptoKey): Promise<string>
async function decrypt(blob: string, key: CryptoKey): Promise<object>

// ECDH: Gebot verschlüsseln (mit publicKey) / entschlüsseln (mit privateKey)
async function encryptGebot(data: object, publicKey: CryptoKey): Promise<string>
async function decryptGebot(blob: string, privateKey: CryptoKey): Promise<object>

// HMAC: Emoji-ID durchsuchbar machen ohne Klartext zu speichern
async function hmac(emojiId: string, partKey: CryptoKey): Promise<string>

// Schlüssel generieren
async function generatePartKey(): Promise<CryptoKey>
async function generateAdminKeyPair(): Promise<{ privateKey: CryptoKey, publicKey: CryptoKey }>

// Schlüssel serialisieren / deserialisieren (für URL-Fragment)
async function exportKey(key: CryptoKey): Promise<string>
async function importPartKey(raw: string): Promise<CryptoKey>
async function importPrivKey(raw: string): Promise<CryptoKey>
async function importPubKey(raw: string): Promise<CryptoKey>
```

---

## Solidarische Berechnungslogik

```
richtwert = gesamtkosten / summe(gewichtung × anzahl für alle belegten slots)

für jedes gebot:
  anteil = gebot.gewichtung × richtwert

  wenn gebot.betrag <= anteil:
    solidarischer_beitrag = gebot.betrag      // zahlt nur Gebot
  sonst:
    solidarischer_beitrag = anteil            // wird reduziert

falls summe(solidarische_beiträge) < gesamtkosten:
  // Fehlbetrag anzeigen

falls summe(solidarische_beiträge) > gesamtkosten:
  // Überschuss anteilig reduzieren bei denen die mehr geboten haben
```

---

## Emoji-ID

- Liste von 50 positiven, eindeutigen Emojis
- Drei zufällige Emojis via `crypto.getRandomValues()`
- 50³ = 125.000 mögliche Kombinationen
- Kein Klartext auf dem Server — nur `HMAC(emojiId, partKey)` gespeichert
- Lokal im Browser als persönlicher Beleg (ab Feature 4 in localStorage)

---

## localStorage-Schema (ab Feature 4)

```typescript
interface MeineRunden {
  runden: {
    id: string
    name: string             // nur lokal, nie auf Server
    adminLink?: string       // nur wenn Organisatorin
    teilnehmerLink: string
    erstellt: string
    ergebnis?: Auswertung    // lokal gecacht nach Auswertung
  }[]
  templates: {
    name: string
    slots: SlotTyp[]
  }[]
}
```

Export / Import als JSON-Datei.

---

## Sicherheitshinweise

- HTTPS ist Pflicht (Schlüssel im Fragment sind sonst per MITM angreifbar)
- `history.replaceState()` nach erstem Laden (Fragment aus Browser-History entfernen)
- Kein `console.log` mit Schlüsseln oder entschlüsselten Daten
- Kein Tracking, keine Cookies, keine Analytics

---

## Abhängigkeiten (Ziel: minimal halten)

**MVP 0 + MVP 1: keine externen Abhängigkeiten außer Astro/Tailwind.**

- `astro`
- `@astrojs/node`
- `@astrojs/tailwind`
- `tailwindcss`
- `xlsx` — nur ab Feature 1 (Splid-Import)
