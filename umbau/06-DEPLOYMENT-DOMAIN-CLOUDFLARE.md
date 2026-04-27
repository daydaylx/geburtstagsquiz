# 06 - Deployment, Domain, Cloudflare

## Grundentscheidung

Domain/Cloudflare kommt nach lokaler 3-UI-Stabilitaet. Vorher wuerde jeder Rollen-, Session- oder Broadcastfehler schwerer zu debuggen.

## Ziel-Domainstruktur

```text
tv.<domain>    -> Display UI (oeffnet ohne Parameter, erstellt Raum per Button)
host.<domain>  -> Host Controller UI (braucht ?hostToken=YYY aus Host-QR)
play.<domain>  -> Player UI (braucht ?joinCode=XXX aus Player-QR)
api.<domain>   -> WebSocket/API Backend
```

## Lokale Ports

```text
server       3001
web-host     5173
web-player   5174
web-display  5175
```

## QR-Code-Konzept

**Player-QR** (groß auf TV sichtbar, fuer alle Spieler):

```text
https://play.<domain>?joinCode=ABC234
```

**Host-QR** (auf TV sichtbar bis Kopplung, dann ausgeblendet):

```text
https://host.<domain>?hostToken=<langer-zufaelliger-token>
```

Wichtig:

- `hostToken` ist lang und nicht erratbar (kryptografisch zufaellig).
- Der `hostToken` in der URL ist nur fuer initiales Pairing.
- Nach erfolgreichem Host-Pairing blendet das TV den Host-QR aus.
- QR-Codes duerfen NIEMALS auf `localhost` zeigen (auch nicht bei lokalem Test mit Handys).
- Bei Hotspot-Betrieb muessen die QR-Codes auf die Hotspot-IP zeigen.
- Bei Domainbetrieb zeigen QR-Codes auf die Subdomains.

**Display-Link** (intern, nicht als QR auf dem TV):

```text
https://tv.<domain>
```

Der Display-Link braucht keinen Token in der URL, weil das TV den Raum selbst erstellt. Ein `displayToken` fuer Reconnect wird vom Server vergeben und im Browser-Storage des TV gespeichert, nicht in der URL.

## Env-Variablen lokal

Ziel fuer alle Vite-Apps:

```env
VITE_SERVER_SOCKET_URL=ws://localhost:3001
VITE_DISPLAY_URL=http://localhost:5175
VITE_HOST_URL=http://localhost:5173
VITE_PLAYER_JOIN_BASE_URL=http://localhost:5174
```

Fuer Hotspot-Betrieb (Handys koennen localhost nicht erreichen):

```env
VITE_SERVER_SOCKET_URL=ws://<hotspot-ip>:3001
VITE_DISPLAY_URL=http://<hotspot-ip>:5175
VITE_HOST_URL=http://<hotspot-ip>:5173
VITE_PLAYER_JOIN_BASE_URL=http://<hotspot-ip>:5174
```

Die alten Variablen `VITE_PUBLIC_HOST`, `VITE_SERVER_PORT`, `VITE_PLAYER_PORT` koennen in einer Migrationsphase noch unterstuetzt werden, sind aber nicht das Zielmodell.

## Env-Variablen Domain

```env
VITE_SERVER_SOCKET_URL=wss://api.<domain>
VITE_DISPLAY_URL=https://tv.<domain>
VITE_HOST_URL=https://host.<domain>
VITE_PLAYER_JOIN_BASE_URL=https://play.<domain>
```

## Verwendung der Env-Variablen

Display-App baut QR-Inhalte:

```text
Player-QR:  ${VITE_PLAYER_JOIN_BASE_URL}?joinCode=${joinCode}
Host-QR:    ${VITE_HOST_URL}?hostToken=${hostToken}
```

Die Display-App baut die QR-Inhalte aus dem Env und den Tokens, die vom Server in `display:room-created` kommen. Der Server selbst sendet nur Tokens und Codes, keine vollstaendigen URLs.

## WebSocket-URL-Regeln

- Apps verwenden zuerst `VITE_SERVER_SOCKET_URL`.
- Wenn nicht gesetzt, darf lokal aus `window.location` plus Port gefolgert werden (Fallback nur fuer lokale Entwicklung).
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

- Schnell einzurichten.
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

Voraussetzung: Lokaler 3-UI-E2E-Test bestanden.

- TV oeffnet `tv.<domain>`, klickt "Quizraum erstellen".
- TV zeigt Player-QR (zeigt auf `play.<domain>`) und Host-QR (zeigt auf `host.<domain>`).
- Host scannt Host-QR, landet auf `host.<domain>?hostToken=YYY`, koppelt sich.
- Spieler scannen Player-QR, landen auf `play.<domain>?joinCode=XXX`.
- Alle Clients verbinden zu `wss://api.<domain>`.
- Mindestens eine komplette Runde funktioniert.
- Reconnect fuer Host, Display und Player wurde getestet.
- Keine App verbindet sich zu `localhost`.
- QR zeigt nie auf `localhost`.
