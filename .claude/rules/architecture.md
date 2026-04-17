# Architecture Details

## Data flow

1. **Create round** (`neu.astro` → `POST /api/runde/erstellen`): generate keys, encrypt blob, server returns 8-char ID + 16-char adminToken, save participant/admin links locally.
2. **Submit bid** (`/runde/[id]`): fetch + decrypt blob, encrypt bid with admin pubkey via ephemeral ECDH, POST with HMAC-based emojiHmac for deduplication.
3. **Admin view** (`/runde/[id]/admin/[token]`): server verifies token (timing-safe), client decrypts all bids with adminPrivKey, runs solidarisch calculation.

## Server-side JSON schema

```json
{
  "id": "abc12345",
  "adminToken": "1234567890abcdef",
  "encTeilnehmerBlob": "<iv>.<ct>",
  "gebote": [
    { "emojiHmac": "<base64url>", "encGebot": "<ephPubKey>.<iv>.<ct>" }
  ]
}
```

Files in `data/runden/` are auto-deleted after 6 months.
