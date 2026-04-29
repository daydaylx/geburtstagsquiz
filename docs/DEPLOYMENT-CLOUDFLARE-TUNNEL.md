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

## Lokale Env

Beispiel: [.env.local.example](../.env.local.example)

```env
PORT=3001
HOST=0.0.0.0
VITE_PUBLIC_HOST=localhost
VITE_HOST_PORT=5173
VITE_PLAYER_PORT=5174
VITE_DISPLAY_URL=http://localhost:5175
VITE_HOST_URL=http://localhost:5173
VITE_PLAYER_JOIN_BASE_URL=http://localhost:5174
VITE_SERVER_SOCKET_URL=ws://localhost:3001
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:5174,http://localhost:5175,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175
```

Ohne `VITE_SERVER_SOCKET_URL` nutzen die Frontends lokal den Same-Origin-Proxy `/ws`.

Fuer Handytests im LAN ohne Tunnel muessen die LAN-Origins zusaetzlich in `ALLOWED_ORIGINS`, zum Beispiel:

```text
http://192.168.x.x:5173
http://192.168.x.x:5174
http://192.168.x.x:5175
```

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

Nur nach lokal stabilem Test:

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

## Startreihenfolge Lokal

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm dev
```

Dann pruefen:

```text
Display: http://localhost:5175
Host:    http://localhost:5173
Player:  http://localhost:5174
Server:  http://localhost:3001/health
WS:      ws://localhost:3001
```

Alternativ fuer den Abendbetrieb mit lokalem Hotspot:

```bash
./start_local_game_host.sh
```

Standard: Das Skript startet alle vier Dienste und oeffnet die Display-URL.

Nuetzliche Overrides:

```env
DISPLAY_WEB_PORT=5175
HOST_WEB_PORT=5173
PLAYER_WEB_PORT=5174
SERVER_PORT=3001
OPEN_DISPLAY_BROWSER=true
OPEN_HOST_BROWSER=false
```

## Startreihenfolge Mit Tunnel

1. Lokale Dienste starten und pruefen.
2. Echte lokale Tunnel-Config aus `deploy/cloudflare-tunnel.example.yml` ableiten.
3. Tunnel starten:

```bash
cloudflared tunnel --config .cloudflared/config.yml run <tunnel-name>
```

oder, wenn die lokale Config im Repo-Arbeitsverzeichnis liegt:

```bash
CONFIRM_CLOUDFLARE_TUNNEL_START=1 ./start_tunnel.sh
```

Dann oeffnen:

```text
https://tv.quiz.disaai.de
https://host.quiz.disaai.de
https://play.quiz.disaai.de
wss://api.quiz.disaai.de
```

`start_tunnel.sh` und `start_domain_quiz.sh` brechen ohne `CONFIRM_CLOUDFLARE_TUNNEL_START=1` ab. Das ist Absicht: Der Tunnel darf erst nach stabilem lokalem Smoke-Test und expliziter Cloudflare-Freigabe gestartet werden.

## QR-Code-Test

1. `https://tv.quiz.disaai.de` oder lokal `http://localhost:5175` oeffnen.
2. Raum am Display erstellen.
3. Host-QR muss auf `https://host.quiz.disaai.de?hostToken=<token>` zeigen.
4. Player-QR muss auf `https://play.quiz.disaai.de?joinCode=<code>` zeigen.
5. Im lokalen Modus entsprechend `localhost:5173` und `localhost:5174`.

Fehlerhaft waeren `localhost` im Domain-QR, `ws://api.quiz.disaai.de`, `wss://localhost:3001` oder ein Host-Token auf der TV-URL.

## WebSocket-Test

Bei laufenden lokalen Diensten:

```bash
corepack pnpm run smoke:local
```

Der Smoke-Test verbindet Display, Host und zwei Player, startet eine Runde, sendet Antworten, wartet auf Reveal und Scoreboard und prueft Resume fuer Display, Host und einen Player.

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
