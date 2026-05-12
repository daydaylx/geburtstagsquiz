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
./quiz.sh
```

Dann pruefen:

```text
Host:    http://localhost:5173
Display: http://localhost:5175
Player:  http://localhost:5174
Server:  http://localhost:3001/health
WS:      ws://localhost:3001
```

Der Host ist der Startpunkt. Dort Raum erstellen und "Display oeffnen" nutzen.

Manueller Dev-Start bleibt moeglich mit `corepack pnpm dev`; danach ebenfalls im Host starten.

## Hybrid-Modus: Host/Display lokal, Player oeffentlich

Im Menue von `./quiz.sh` den Hybrid-Modus waehlen. Dann gilt:

```text
Host:    http://localhost:5173
Display: http://localhost:5175
Player:  https://play.quiz.disaai.de
API/WS:  wss://api.quiz.disaai.de
```

Der Host und das Display verbinden sich lokal per `ws://localhost:3001`. Die Player-UI wird lokal auf Port `5174` gestartet, ist aber ueber den Tunnel unter `https://play.quiz.disaai.de` erreichbar und verbindet sich mit `wss://api.quiz.disaai.de`. Der Player-QR im Host und Display muss in diesem Modus auf `https://play.quiz.disaai.de?joinCode=<code>` zeigen.

## Startreihenfolge Mit Tunnel

1. Lokale Dienste starten und pruefen.
2. Echte lokale Tunnel-Config aus `deploy/cloudflare-tunnel.example.yml` ableiten.
3. Tunnel-Modus ueber `quiz.sh` mit expliziter lokaler Bestaetigung starten:

```bash
CONFIRM_CLOUDFLARE_TUNNEL_START=1 ./quiz.sh
```

Dann oeffnen:

```text
https://tv.quiz.disaai.de
https://host.quiz.disaai.de
https://play.quiz.disaai.de
wss://api.quiz.disaai.de
```

Dieses Repo enthaelt keine separaten `start_tunnel.sh`- oder `start_domain_quiz.sh`-Wrapper. `quiz.sh` ist der unterstuetzte Einstieg. Cloudflare-/DNS-Aenderungen brauchen weiterhin explizites `[CONFIRM]`; ein bestehender Tunnel darf erst nach stabilem lokalem Smoke-Test genutzt werden.

## QR-Code-Test

1. Host unter `http://localhost:5173` oeffnen.
2. Raum im Host erstellen.
3. Display per Button "Display oeffnen" starten.
4. Player-QR muss im Hybrid-/Tunnelmodus auf `https://play.quiz.disaai.de?joinCode=<code>` zeigen.
5. Im rein lokalen Modus zeigt der Player-QR entsprechend auf `localhost:5174`.

Fehlerhaft waeren `localhost` im Party-/Domain-QR, `ws://api.quiz.disaai.de`, `wss://localhost:3001` oder ein Host-Token auf der TV-URL.

## WebSocket-Test

Bei laufenden lokalen Diensten:

```bash
corepack pnpm run smoke:local
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
