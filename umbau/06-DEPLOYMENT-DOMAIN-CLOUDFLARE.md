# 06 - Deployment, Domain, Cloudflare

## Grundentscheidung

Domain/Cloudflare kommt nach lokaler 3-UI-Stabilitaet. Vorher wuerde jeder Rollen-, Session- oder Broadcastfehler schwerer zu debuggen.

## Ziel-Domainstruktur

```text
tv.<domain>    -> Display UI
host.<domain>  -> Host Controller UI
play.<domain>  -> Player UI
api.<domain>   -> WebSocket/API Backend
```

## Lokale Ports

```text
server       3001
web-host     5173
web-player   5174
web-display  5175
```

## Env-Variablen lokal

Ziel fuer alle Vite-Apps:

```env
VITE_SERVER_SOCKET_URL=ws://localhost:3001
VITE_DISPLAY_URL=http://localhost:5175
VITE_HOST_URL=http://localhost:5173
VITE_PLAYER_JOIN_BASE_URL=http://localhost:5174
```

Fuer Hotspot-Betrieb:

```env
VITE_SERVER_SOCKET_URL=ws://<hotspot-ip>:3001
VITE_DISPLAY_URL=http://<hotspot-ip>:5175
VITE_HOST_URL=http://<hotspot-ip>:5173
VITE_PLAYER_JOIN_BASE_URL=http://<hotspot-ip>:5174
```

Die alten Variablen `VITE_PUBLIC_HOST`, `VITE_SERVER_PORT`, `VITE_PLAYER_PORT` koennen in einer Migrationsphase noch unterstuetzt werden, sollten aber nicht das Zielmodell bleiben.

## Env-Variablen Domain

```env
VITE_SERVER_SOCKET_URL=wss://api.<domain>
VITE_DISPLAY_URL=https://tv.<domain>
VITE_HOST_URL=https://host.<domain>
VITE_PLAYER_JOIN_BASE_URL=https://play.<domain>
```

## QR-Code-Verhalten

Player-QR:

```text
https://play.<domain>?joinCode=ABC234
```

Display-Link:

```text
https://tv.<domain>?displayToken=<token>
```

Host zeigt beide Links. Display zeigt nur Player-Join-Daten, nicht seinen eigenen Token.

## WebSocket-URL-Regeln

- Apps verwenden zuerst `VITE_SERVER_SOCKET_URL`.
- Wenn nicht gesetzt, darf lokal aus `window.location` plus Port gefolgert werden.
- In Domainumgebung darf nicht auf `localhost` oder Vite-Port geraten werden.
- HTTPS-Seiten verbinden nur ueber `wss://`.
- `api.<domain>` muss WebSocket-Upgrades erlauben.

## Variante A: Cloudflare Tunnel

Aufbau:

```text
tv.<domain>    -> localhost:5175
host.<domain>  -> localhost:5173
play.<domain>  -> localhost:5174
api.<domain>   -> localhost:3001
```

Vorteile:

- Schnell.
- Kein Router-Portforwarding.
- Node-Server bleibt unveraendert.
- Gut fuer privaten Abend und Tests.

Nachteile:

- Lokaler Rechner muss laufen.
- Sleep/Netzwerkprobleme beenden faktisch den Abend.
- Vite-Dev-Server ist fuer den Abend okay, aber kein sauberer Produktionsbetrieb.

Empfehlung: Erste Domain-Testvariante.

## Variante B: Cloudflare Pages + Node Backend

Aufbau:

```text
tv/host/play -> Cloudflare Pages
api          -> Node-Server via VPS oder Tunnel
```

Vorteile:

- Frontends stabil online.
- Keine Vite-Server fuer Frontends.
- Backend kann Node bleiben.

Nachteile:

- Backend bleibt separater Dienst.
- CORS/WebSocket/Env muessen sauber gesetzt sein.
- Build-/Deploy-Pipeline fuer drei Apps noetig.

Empfehlung: Beste mittelfristige Variante, wenn nach dem lokalen Umbau noch Zeit ist.

## Variante C: Worker + Durable Objects

Aufbau:

```text
tv/host/play -> Cloudflare Pages
api/ws       -> Cloudflare Worker
Room-State   -> Durable Object pro Raum
```

Vorteile:

- Echte Cloud-Raumlogik.
- Kein lokaler Rechner.
- WebSocket-State pro Raum langfristig sauber.

Nachteile:

- Aktueller Node-WebSocket-Server muesste stark umgebaut werden.
- Timer, Sessions, Reconnect und In-Memory-State muessen neu gedacht werden.
- Hoher Testaufwand.

Entscheidung: Nicht im ersten Umbau.

## Startskripte

Spaeter anpassen:

- Display-Port `5175` aufnehmen.
- `VITE_DISPLAY_URL` setzen.
- `VITE_HOST_URL` setzen.
- `VITE_PLAYER_JOIN_BASE_URL` setzen.
- `VITE_SERVER_SOCKET_URL` setzen.
- UFW/Portfreigabe fuer `5175` ergaenzen.

## Abnahme fuer Domain-Test

- Host erstellt Raum ueber `host.<domain>`.
- Display oeffnet Link ueber `tv.<domain>`.
- Player scannt QR und landet auf `play.<domain>`.
- Alle Clients verbinden zu `wss://api.<domain>`.
- Mindestens eine komplette Runde funktioniert.
- Reconnect fuer Host, Display und Player wurde getestet.

