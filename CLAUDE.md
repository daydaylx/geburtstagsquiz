# CLAUDE.md

## Zweck

Claude-Code-Agenten verwenden `AGENTS.md` als kanonische Projektregel. Diese Datei ist nur eine kurze Zusatzorientierung, damit keine alte Dual-Screen-Annahme weiterlebt.

## Aktueller Projektstand

Das Geburtstagsquiz besteht aus vier lokalen Services:

- `apps/server`: WebSocket/API-Backend auf Port `3001`
- `apps/web-display`: Display/TV-UI auf Port `5175`
- `apps/web-host`: Host-Controller-UI auf Port `5173`
- `apps/web-player`: Player-UI auf Port `5174`

Ziel-Subdomains fuer spaeteren Tunnelbetrieb:

- `tv.quiz.disaai.de`
- `host.quiz.disaai.de`
- `play.quiz.disaai.de`
- `api.quiz.disaai.de`

`disaai.de`, `www.disaai.de` und bestehende Disa-AI-Deployments duerfen nicht angefasst werden.

## Sofortregeln

- Lies zuerst `AGENTS.md`, `WORKFLOW.md` und die betroffenen Dateien.
- Baue keine Features ohne ausdruecklichen Auftrag.
- Redesign die UI nicht ohne ausdruecklichen Auftrag.
- Aendere Fragenkatalog, Spielmechanik oder Scoring nicht ohne ausdruecklichen Auftrag.
- Schreibe keine Secrets, Tokens, Zertifikate oder Cloudflare-Credentials ins Repo.
- Fuehre keine echten Cloudflare-/DNS-Aktionen ohne `[CONFIRM]` aus.
- Priorisiere lokalen Betrieb und lokale Tests vor Tunnel-/Domainarbeit.

## Arbeitsweise

Vor Aenderungen:

```bash
git status --short
```

Nach relevanten Aenderungen:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Bei laufendem Server fuer den lokalen Protokollfluss:

```bash
corepack pnpm run smoke:local
```

Wenn ein Befehl nicht ausgefuehrt werden kann, benenne den Grund konkret.

## Scope-Grenze

Dieses Repo soll einen Geburtstagsquiz-Abend stabil tragen. Es ist kein Ort fuer Accounts, Adminsysteme, neue Persistenz, Durable Objects, neue Modi, Teams, Joker, Buzzer oder Deployment-Ausbau ohne separaten Auftrag.
