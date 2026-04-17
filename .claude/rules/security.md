# Security Rules

Zero-knowledge is the core promise of this app — these rules are non-negotiable.

- **No plaintext on the server** — never send slots, bids, names, or amounts unencrypted
- Encryption always happens in the browser, before the API call
- Only WebCrypto API for cryptography — no external crypto packages
- No `console.log` with keys or decrypted content
- HTTPS is required
- After loading a link: remove the fragment via `history.replaceState()`
