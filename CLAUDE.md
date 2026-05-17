# CLAUDE.md

Kanonische Projektregeln stehen in `AGENTS.md` und `WORKFLOW.md`. Diese Datei ist ein harter Mindeststandard fuer Claude-Code-Agenten, die AGENTS.md noch nicht gelesen haben.

## Sofortregeln

- Lies zuerst `AGENTS.md`, `WORKFLOW.md` und die betroffenen Dateien.
- Baue keine Features ohne ausdruecklichen Auftrag.
- Redesign die UI nicht ohne ausdruecklichen Auftrag.
- Aendere Fragenkatalog, Spielmechanik oder Scoring nicht ohne ausdruecklichen Auftrag.
- Schreibe keine Secrets, Tokens, Zertifikate oder Cloudflare-Credentials ins Repo.
- Fuehre keine Cloudflare-/DNS-Konfigurationsaktionen ohne `[CONFIRM]` aus.
- Behandle den bestehenden Cloudflare Tunnel als Standard-Abendbetrieb; lokale Ports sind nur interne Zielports.

## Validierung

Vor Aenderungen: `git status --short`

Nach relevanten Aenderungen:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Bei laufendem Server: `corepack pnpm run smoke:local`
Bei laufendem Tunnel: `SMOKE_WS_URL=wss://api.quiz.disaai.de corepack pnpm run smoke:local`

Wenn ein Befehl nicht ausgefuehrt werden kann, benenne den Grund konkret.
