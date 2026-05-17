# Cloudflare Tunnel Deployment

## Ziel

Der Laptop bleibt der Server. Cloudflare Tunnel ist nur die oeffentliche Verbindung von festen Subdomains unter `quiz.disaai.de` zu den lokal laufenden Diensten.

```text
Subdomains unter disaai.de
-> Cloudflare Tunnel
-> Laptop
-> lokale Quiz-Dienste
```

Keine Cloud-Migration: keine Workers, keine Durable Objects, keine Datenbank, keine Accounts, keine Cloud-Persistenz.

Diese Datei ist Dokumentation und Beispielbetrieb. Sie ist keine Freigabe fuer echte Cloudflare- oder DNS-Aenderungen.

## Subdomains

| Subdomain | Lokaler Dienst | Port |
| --- | --- | --- |
| `tv.quiz.disaai.de` | Display/TV-UI | `5175` |
| `host.quiz.disaai.de` | Host-Controller | `5173` |
| `play.quiz.disaai.de` | Player-UI | `5174` |
| `api.quiz.disaai.de` | Server/API/WebSocket | `3001` |

Wenn Laptop, lokaler Server oder Tunnel aus sind, sind diese Subdomains nicht spielbar. Das ist bewusst so.

## Domain Env

Beispiel: [.env.tunnel.example](../.env.tunnel.example)

```env
PORT=3001
HOST=0.0.0.0
VITE_DISPLAY_URL=https://tv.quiz.disaai.de
VITE_HOST_URL=https://host.quiz.disaai.de
VITE_PLAYER_JOIN_BASE_URL=https://play.quiz.disaai.de
VITE_SERVER_SOCKET_URL=wss://api.quiz.disaai.de
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175,https://tv.quiz.disaai.de,https://host.quiz.disaai.de,https://play.quiz.disaai.de
```

WebSocket-Prioritaet:

1. `VITE_SERVER_SOCKET_URL` exakt verwenden.
2. Sonst Same-Origin `/ws` verwenden.
3. Kein automatisches localhost-Port-Raten im Domainbetrieb.

## Tunnel Mapping

Beispiel: [deploy/cloudflare-tunnel.example.yml](../deploy/cloudflare-tunnel.example.yml)

```yaml
tunnel: <TUNNEL_ID>
credentials-file: /home/<user>/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: tv.quiz.disaai.de
    service: http://localhost:5175

  - hostname: host.quiz.disaai.de
    service: http://localhost:5173

  - hostname: play.quiz.disaai.de
    service: http://localhost:5174

  - hostname: api.quiz.disaai.de
    service: http://localhost:3001

  - service: http_status:404
```

Echte lokale Configs liegen zum Beispiel in `.cloudflared/config.yml` oder `~/.cloudflared/config.yml` und duerfen nicht committed werden.

## Manuelle Cloudflare-Schritte

Nur wenn Tunnel, Routen oder DNS noch nicht eingerichtet sind:

1. In Cloudflare einen Tunnel fuer den Laptop anlegen oder bestehenden Tunnel nutzen.
2. Credentials lokal unter `~/.cloudflared/` speichern.
3. CNAME-/Tunnel-Routen fuer exakt diese Hostnames setzen:
   `tv.quiz.disaai.de`, `host.quiz.disaai.de`, `play.quiz.disaai.de`, `api.quiz.disaai.de`.
4. `disaai.de` und `www.disaai.de` nicht anfassen.
5. Keine bestehenden Disa-AI-Deployments veraendern.

DNS-, Tunnel-Routing-, Secret- und CLI/API-Aenderungen brauchen explizites `[CONFIRM]`. Erlaubte reine Checks sind:

```bash
cloudflared --version
cloudflared tunnel list
```

Ohne `[CONFIRM]` duerfen keine DNS-Eintraege angelegt, geaendert, geloescht oder ueberschrieben werden.

## Startreihenfolge

```bash
corepack pnpm install --frozen-lockfile
./quiz.sh
```

`quiz.sh` startet alte Projektprozesse sauber neu, startet Server, Display, Host, Player und startet danach den bestehenden Cloudflare Tunnel aus `.cloudflared/config.yml`.

Dann pruefen:

```text
Host:    https://host.quiz.disaai.de
Display: https://tv.quiz.disaai.de
Player:  https://play.quiz.disaai.de
Server:  https://api.quiz.disaai.de/health
WS:      wss://api.quiz.disaai.de
```

Der Host ist der Startpunkt. Dort Raum erstellen und "Display oeffnen" nutzen.

Manueller Dev-Start bleibt moeglich mit `corepack pnpm dev`; fuer den Abend bleibt `./quiz.sh` der unterstuetzte Einstieg.

Dieses Repo enthaelt keine separaten `start_tunnel.sh`- oder `start_domain_quiz.sh`-Wrapper. Cloudflare-/DNS-Konfigurationsaenderungen brauchen weiterhin explizites `[CONFIRM]`.

## QR-Code-Test

1. Host unter `https://host.quiz.disaai.de` oeffnen.
2. Raum im Host erstellen.
3. Display per Button "Display oeffnen" starten.
4. Player-QR muss auf `https://play.quiz.disaai.de?joinCode=<code>` zeigen.

Fehlerhaft waeren `localhost` im Party-/Domain-QR, `ws://api.quiz.disaai.de`, `wss://localhost:3001` oder ein Host-Token auf der TV-URL.

## WebSocket-Test

Bei laufendem Server:

```bash
corepack pnpm run smoke:local
SMOKE_WS_URL=wss://api.quiz.disaai.de corepack pnpm run smoke:local
```

Der Smoke-Test erstellt den Raum ueber den Host, koppelt das Display, verbindet zwei Player, startet einen 90s-Spielplan, prueft Reveal-Bereitschaft, Scoreboard nach Frage 5, Endstand und Resume fuer Display, Host und einen Player.

## Fehlerdiagnose

| Symptom | Pruefung |
| --- | --- |
| Subdomain nicht erreichbar | Laeuft der Laptop, der Tunnel und der lokale Zielport? |
| WebSocket verbindet nicht | `VITE_SERVER_SOCKET_URL`, `ALLOWED_ORIGINS`, Tunnel-Mapping `api.quiz.disaai.de -> localhost:3001` pruefen |
| QR zeigt falsche Domain | `VITE_HOST_URL` und `VITE_PLAYER_JOIN_BASE_URL` pruefen |
| Display-Link zeigt falsche Domain | `VITE_DISPLAY_URL` pruefen |
| Lokaler Port belegt | `ss -H -ltnp '( sport = :3001 or sport = :5173 or sport = :5174 or sport = :5175 )'` |
| Browser-Origin abgelehnt | Origin in `ALLOWED_ORIGINS` aufnehmen |

## Niemals Committen

```text
.cloudflared/
*.pem
*.cert
*.crt
*.key
*credentials*.json
echte Tokens oder Secrets
```

## Harte Grenzen

- Laptop aus = Quiz ueber Subdomains nicht erreichbar.
- Tunnel aus = Quiz ueber Subdomains nicht erreichbar.
- Server aus = Quiz nicht spielbar.
- Cloudflare Tunnel ist nur die Verbindung, nicht die Hosting-Architektur.
