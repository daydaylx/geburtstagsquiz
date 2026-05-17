# Fehleranalyse Geburtstagsquiz

**Datum:** 10.05.2026  
**Repo:** `~/Schreibtisch/geburtstagsquiz`  
**Branch:** `main` (Commit `a3debc3`)

---

## 1. Kurzfazit

- **Laeuft das Quiz grundsaetzlich?** Ja. Typecheck, 202 Tests, Build und Smoke-Test laufen sauber durch. Alle 4 Services starten und sprechen miteinander.
- **Groesster Blocker?** `.env.local` enthaelt Tunnel-URLs statt localhost-URLs. Wer `pnpm dev` ohne `quiz.sh` startet, bekommt QR-Codes und WebSocket-URLs die auf `quiz.disaai.de` zeigen. Das bricht den lokalen Betrieb.
- **Ist der aktuelle Stand partytauglich?** **Eingeschraenkt ja**, wenn `quiz.sh` im Lokal-Modus verwendet wird. Es gibt keine echten Blocker im Host-First-Flow, aber mehrere mittelgradige Probleme die den Abend stoeren koennen (s.u.).

---

## 2. Ausgefuehrte Befehle

| Befehl | Ergebnis | Bemerkung |
|---|---|---|
| `corepack pnpm install --frozen-lockfile` | OK | Lockfile aktuell, 940ms |
| `corepack pnpm typecheck` | OK | Alle 9 Packages sauber |
| `corepack pnpm test` | OK | 17 Testdateien, 202 Tests bestanden, 5.49s |
| `corepack pnpm build` | OK | Server tsc + 3x Vite build sauber |
| `corepack pnpm run smoke:local` | OK | Host-first + Legacy-Display-Flow bestanden |
| `corepack pnpm lint` | **Nicht vorhanden** | Kein lint-Skript definiert, kein ESLint konfiguriert |

---

## 3. Start-/Port-Status

| Dienst | URL | Status | Problem |
|---|---|---|---|
| Server | `http://localhost:3001` | Läuft | — |
| Host | `http://localhost:5173` | Läuft | — |
| Display | `http://localhost:5175` | Läuft | — |
| Player | `http://localhost:5174` | Läuft | — |

Alle 4 Ports belegt, keine Portkonflikte. Dienste wurden einzeln per `pnpm --filter` gestartet (Server war bereits aktiv).

---

## 4. Getesteter Spielablauf

Der Smoke-Test (`scripts/smoke-local-game.mjs`) prueft den vollstaendigen Ablauf:

- **Display geoeffnet?** Ja (via Popout-Token)
- **Raum erstellt?** Ja (Host-first)
- **Host gekoppelt?** Ja (automatisch, da Host den Raum erstellt)
- **Player beigetreten?** Ja (2 Player per WebSocket)
- **Spiel gestartet?** Ja (90s-Spielplan)
- **Frage angezeigt?** Ja
- **Antwort gesendet?** Ja
- **Reveal funktioniert?** Ja
- **Scoreboard funktioniert?** Ja (nur nach Frage 5)
- **Endstand funktioniert?** Ja
- **Reconnect/Resume?** Ja

---

## 5. Gefundene Fehler

### Fehler 1: `.env.local` enthaelt Tunnel-URLs

- **Schweregrad:** Hoch
- **Reproduktion:** `pnpm dev` ohne `quiz.sh` starten → QR-Codes zeigen auf `https://play.quiz.disaai.de` statt `http://localhost:5174`
- **Erwartet:** `.env.local` hat localhost-URLs fuer lokale Entwicklung
- **Tatsaechlich:** `.env.local` enthaelt:
  ```
  VITE_PLAYER_JOIN_BASE_URL=https://play.quiz.disaai.de
  VITE_SERVER_SOCKET_URL=wss://api.quiz.disaai.de
  VITE_DISPLAY_URL=https://tv.quiz.disaai.de
  VITE_HOST_URL=https://host.quiz.disaai.de
  ```
- **Betroffene Dateien:** `.env.local`
- **Vermutete Ursache:** Tunnel-URLs wurden direkt in `.env.local` statt in `.env.tunnel` eingetragen
- **Konkreter Fix-Vorschlag:** `.env.local` durch Inhalt von `.env.local.example` ersetzen (localhost-URLs). Tunnel-URLs gehoeren in `.env.tunnel` oder werden per `quiz.sh` gesetzt.

### Fehler 2: Server-Auth fehlt `session.roomId`-Pruefung bei Spielstart und Frage-Weiter

- **Schweregrad:** Mittel
- **Reproduktion:** Ein Host in Raum A sendet `GAME_START` oder `GAME_NEXT_QUESTION` mit der roomId von Raum B. Der Server fuehrt die Aktion in Raum B aus.
- **Erwartet:** Server lehnt ab weil der Host nicht zu Raum B gehoert
- **Tatsaechlich:** Server prueft nur `session.role === "host"`, nicht `session.roomId === payload.roomId`
- **Betroffene Dateien:**
  - `apps/server/src/game.ts:91-105` (`handleGameStart`)
  - `apps/server/src/game.ts:207-221` (`handleGameNextQuestion`)
- **Vermutete Ursache:** Andere Handler nutzen den Helper `getAuthorizedHostRoom()` der die Pruefung enthaelt; diese beiden Handler haben eine eigene Inline-Auth die unvollstaendig ist
- **Konkreter Fix-Vorschlag:** Beide Handler auf `getAuthorizedHostRoom()` umstellen oder `session.roomId === payload.roomId`-Pruefung ergaenzen

### Fehler 3: Server-Auth fehlt `session.roomId`-Pruefung bei Kategorie-Voting

- **Schweregrad:** Mittel
- **Reproduktion:** Ein Player in Raum A sendet `CATEGORY_VOTE` mit der roomId von Raum B
- **Erwartet:** Server lehnt ab
- **Tatsaechlich:** Vote wird in Raum B gezaehlt
- **Betroffene Dateien:** `apps/server/src/lobby.ts:440-442` (`handleCategoryVote`)
- **Konkreter Fix-Vorschlag:** `session.roomId === payload.roomId`-Pruefung ergaenzen

### Fehler 4: "Neues Spiel"-Button im Host ist ein No-Op

- **Schweregrad:** Niedrig
- **Reproduktion:** Spiel beendet → Host klickt "Neues Spiel" → zeigt nur "Seite neu laden und einen neuen Raum erstellen"
- **Erwartet:** Button startet einen neuen Raum oder ist deaktiviert/beschriftet als "Seite neu laden"
- **Tatsaechlich:** Button sieht aus wie eine Aktion, macht aber nichts
- **Betroffene Dateien:** `apps/web-host/src/hooks/useHostSession.ts:463-468`
- **Konkreter Fix-Vorschlag:** Button-Label zu "Seite neu laden" aendern oder `window.location.reload()` + Session-Clear implementieren

### Fehler 5: Display-First-Flow zeigt hostToken im QR-Code auf dem TV

- **Schweregrad:** Mittel (nur im Legacy-Display-First-Flow)
- **Reproduktion:** Display-first Flow: Display erstellt Raum → zeigt Host-QR-Code auf dem TV. Jeder im Publikum kann den QR scannen und Host-Zugriff erhalten.
- **Erwartet:** hostToken ist nicht im Display-QR sichtbar
- **Tatsaechlich:** QR enthaelt `?hostToken=<token>` — jeder der scannt wird zum Host
- **Betroffene Dateien:** `apps/web-display/src/hooks/useDisplaySession.ts:162-172`, `apps/web-display/src/lib/helpers.ts:52-64`
- **Einschraenkung:** Im **Host-First-Flow** (aktuell Standard) wird `hostToken` nicht ans Display gesendet. Der Leak betrifft nur den Legacy-Display-First-Flow.
- **Konkreter Fix-Vorschlag:** Im Display-First-Flow den Host-QR-Code durch einen kurzen Code ersetzen, den der Host manuell eingibt (anstelle des Tokens im QR)

### Fehler 6: Reconnect waehrend Countdown replayt den Countdown nicht

- **Schweregrad:** Niedrig
- **Reproduktion:** Client (Host/Display) waehrend des Countdowns disconnecten → reconnecten
- **Erwartet:** Client sieht den Countdown weiterlaufen
- **Tatsaechlich:** `syncSessionToRoomState` sendet `GAME_STARTED` aber nicht `QUESTION_COUNTDOWN`. Client springt direkt zur Frage-Ansicht ohne Countdown.
- **Betroffene Dateien:** `apps/server/src/connection.ts:231-240`
- **Konkreter Fix-Vorschlag:** Im `Idle`-GameState-Zweig von `syncSessionToRoomState` zusaetzlich `QUESTION_COUNTDOWN` senden wenn ein Countdown aktiv ist

### Fehler 7: Mid-Game-Reconnect sendet kein `GAME_STARTED` → fehlender `resolvedGamePlan`

- **Schweregrad:** Niedrig
- **Reproduktion:** Spieler laedt Seite neu waehrend eine Frage aktiv ist
- **Erwartet:** Client erhaelt alle Daten um die Frage korrekt anzuzeigen
- **Tatsaechlich:** `syncSessionToRoomState` sendet `QUESTION_SHOW` + Timer + Antwortstatus, aber nicht `GAME_STARTED` mit dem `resolvedGamePlan`. Bei einem frischen Page-Reload fehlt der GamePlan im Client-State.
- **Betroffene Dateien:** `apps/server/src/connection.ts:242-324` (alle GameStates ausser `Idle`)
- **Konkreter Fix-Vorschlag:** `GAME_STARTED`-Event zusaetzlich senden vor den frage-spezifischen Events bei Mid-Game-Reconnects

### Fehler 8: Host verliert `displayConnectToken` bei Token-basiertem Reconnect

- **Schweregrad:** Niedrig
- **Reproduktion:** Host hat localStorage geloescht aber hostToken in der URL → `HOST_CONNECTED`-Handler setzt `displayConnectToken` auf `null` → "Display oeffnen"-Button verschwindet
- **Erwartet:** Host kann Display auch nach Session-Verlust erneut oeffnen
- **Tatsaechlich:** Button fehlt, kein Weg das Display (neu) zu verbinden
- **Betroffene Dateien:** `apps/web-host/src/hooks/useHostSession.ts:257`
- **Einschraenkung:** Tritt nur auf wenn localStorage geloescht wurde und gleichzeitig ein hostToken in der URL existiert. Normalfall nicht betroffen.
- **Konkreter Fix-Vorschlag:** `HOST_CONNECTED`-Payload um `displayConnectToken` erweitern (analog zu `HOST_ROOM_CREATED`)

---

## 6. Sicherheits-/Anzeigeprobleme Display

| Pruefpunkt | Status | Detail |
|---|---|---|
| Sieht der Gast zu viel? | **Nein** | Display zeigt nur Publikumssicht |
| Werden Loesungen zu frueh gezeigt? | **Nein** | `revealedAnswer` wird erst bei `QUESTION_REVEAL` gesetzt |
| Sind Tokens sichtbar? | **Nein** (Host-First) | Im Host-First-Flow: kein hostToken auf dem Display. Im Display-First-Legacy: hostToken im QR sichtbar |
| Gibt es Host-Aktionen auf dem Display? | **Nein** | Keine Buttons, keine Steuerung |
| Per-Spieler-Antworten sichtbar? | **Nein** | Nur aggregierte Zaehler (richtig/falsch/keine) |
| `resolvedGamePlan` intern Daten? | **In State** | Vollstaendiger GamePlan wird ans Display gesendet, aber nicht gerendert |

---

## 7. QR-/URL-Probleme

| Pruefpunkt | Status | Detail |
|---|---|---|
| Player-Link korrekt? | **Ja** (mit `quiz.sh`) | `http://localhost:5174/?joinCode=...` im Lokal-Modus |
| Host-Link korrekt? | **Ja** | Wird nur im Display-First-Flow generiert |
| Display-Link korrekt? | **Ja** | `http://localhost:5175?displayConnectToken=...&roomId=...` |
| Lokal/Tunnel sauber getrennt? | **Ja** (mit `quiz.sh`) | `.env.local` enthaelt aktuell aber Tunnel-URLs — ohne `quiz.sh` falsch |
| QR fuer Handys im WLAN? | **Problem** | `localhost`-QRs sind nur vom selben Geraet scannbar. Fuer Handy im WLAN muesste die LAN-IP verwendet werden (Hybrid-Modus via `quiz.sh`) |

---

## 8. Reconnect-Probleme

| Szenario | Ergebnis | Detail |
|---|---|---|
| Host Refresh | **OK** | `CONNECTION_RESUME` via localStorage, `displayConnectToken` wird bei Bedarf zurueckgesendet |
| Display Refresh | **OK** | `CONNECTION_RESUME` via localStorage, `hostToken` wird nicht geleakt (Host-First) |
| Player Refresh | **OK** | `CONNECTION_RESUME` via localStorage, Antwort wird repliziert |
| Server Restart | **OK** | Alle Clients verlieren Session → Session-Clear → zurueck zum Start-Screen. Kein Haengenbleiben. |
| Kurze Disconnects | **OK** | Auto-Reconnect mit Backoff (1s→2s→5s), Grace-Zeiten: Player 30s, Host 5min, Display 45s |
| Countdown-Phase Reconnect | **Eingeschraenkt** | Countdown wird nicht repliziert, Client springt direkt zur Frage |
| Endlosschleife Reconnect? | **Nein** | `shouldReconnectRef` verhindert Reconnect nach Unmount, Backoff gedeckelt bei 5s |

---

## 9. Tests

| Test-Art | Ergebnis |
|---|---|
| Lint | Nicht vorhanden (kein ESLint) |
| Typecheck | OK — alle 9 Packages |
| Unit-Tests | OK — 17 Dateien, 202 Tests |
| Build | OK — Server + 3x Vite |
| Smoke-Test | OK — Host-first + Display-first |
| Manuelle Browser-Tests | Nicht durchgefuehrt (Services liefen, kein Browser-Zugriff in dieser Umgebung) |

---

## 10. Priorisierte Fix-Liste

### Blocker
_(keine)_

### Echte Ablaufprobleme
1. **`.env.local` Tunnel-URLs** — austauschen gegen localhost-URLs. Bricht lokalen Betrieb ohne `quiz.sh`
2. **Server-Auth Luecken** — `session.roomId`-Pruefung in `handleGameStart`, `handleGameNextQuestion`, `handleCategoryVote` ergaenzen

### UI-/Komfortprobleme
3. **"Neues Spiel"-Button** — umbenennen oder `window.location.reload()` implementieren
4. **QR fuer Handy im WLAN** — Dokumentation klarstellen: fuer Handy-Spieler Hybrid- oder Tunnel-Modus nutzen
5. **Display-First hostToken-Leak** — Host-QR durch manuellen Code ersetzen (Legacy-Flow)

### Reconnect-Kanten
6. **Countdown-Replay** — `QUESTION_COUNTDOWN` in `syncSessionToRoomState` ergaenzen
7. **Mid-Game GamePlan** — `GAME_STARTED` bei Mid-Game-Reconnects mitsenden
8. **Host displayConnectToken bei Token-Reconnect** — `HOST_CONNECTED`-Payload ergaenzen

### Infrastruktur/Dokumentation
9. **ESLint** — Lint-Skript und Basis-Konfiguration hinzufuegen
10. **Dead Code** — `GameState.Completed`-Zweig in `connection.ts:326-335` ist unerreichbar

---

## 11. Empfehlung

### Was muss vor einem echten Quizabend zwingend repariert werden?

1. **`.env.local`** muss localhost-URLs enthalten. Ohne `quiz.sh` ist der lokale Betrieb kaputt. Das ist ein 1-Zeilen-Fix.

### Was ist nur Nice-to-have?

- Server-Auth-Luecken (Fehler 2+3): Die roomId ist eine UUID und nicht erratbar. In einem privaten Geburtstagsquiz-Setting ist das Risiko minimal.
- "Neues Spiel"-Button: Einmal Seite neu laden ist fuer einen Abend akzeptabel.
- Countdown-/GamePlan-Replay: Betrifft nur seltene Reconnect-Szenarien.

### Was sollte nicht angefasst werden?

- Die Spielmechanik, das Scoring und die Frageauswertung sind solide und gut getestet.
- Das WebSocket-Protokoll mit Zod-Schemas und Envelope-Parsing ist robust.
- Der Reconnect-Mechanismus funktioniert fuer alle Normalfaelle.
- Keine neuen Features, keine Datenbank, keine Persistenz einfuehren.
