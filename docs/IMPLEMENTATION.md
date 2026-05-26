# Praktischer Umsetzungs- und Pruefplan

## Ziel

Gebaut wird kein grosses Quiz-System, sondern ein funktionierendes Privatquiz fuer kleine Runden.

Erfolg bedeutet:

- Host kann einen Raum erstellen und zeigt Raumcode, Player-Link, Player-QR und Display-Status.
- Host kann das Display als Popout fuer den HDMI-TV oeffnen.
- Spieler koennen einfach joinen.
- Fragen erscheinen vollstaendig auf dem Display/TV.
- Host sieht Status, Fortschritt und Fallback-Aktionen.
- Handys dienen als Antwort-Controller.
- Antworten werden serverseitig angenommen und ausgewertet.
- Punkte und Rangliste stimmen.
- der Ablauf bleibt auf echten Geraeten stabil genug.

## Tunnel-only Basis

Sicherstellen:

- `./quiz.sh` startet Server, Display, Host, Player und den bestehenden Cloudflare Tunnel.
- Lokale Zielports sind konsistent:
  - Server/API: `3001`
  - Display/TV: `5175`
  - Host: `5173`
  - Player: `5174`
- ein vorgeladenes Quiz ist verfuegbar.
- alle Frontends verbinden sich mit demselben Server.

Abnahme:

- `https://api.quiz.disaai.de/health` antwortet.
- `https://tv.quiz.disaai.de` laedt.
- `https://host.quiz.disaai.de` laedt.
- `https://play.quiz.disaai.de` laedt.
- keine manuelle Nacharbeit an Ports oder Env ist fuer den Standardstart noetig.

## Primaerer Spielablauf

### 1. Host-Raum erstellen

Sicherstellen:

- Host sendet `host:create-room`.
- Server erstellt Raum, Join-Code, Host-Session und Display-Kopplungstoken.
- Host zeigt Raumcode, Player-Link, Player-QR und Display-Status.

Abnahme:

- Host zeigt einen Join-Code.
- Player-Link und Player-QR zeigen im Partybetrieb auf `https://play.quiz.disaai.de`.
- Kein Player-QR zeigt im Partybetrieb auf `localhost`.

### 2. Display oeffnen

Sicherstellen:

- Host oeffnet das Display per Button "Display oeffnen".
- Display verbindet sich per `display:connect-room`.
- Host erhaelt `host:display-paired`.
- Host sieht Raumstatus, Join-Code, Spieler und Einstellungen.

Abnahme:

- Display zeigt nur Publikumssicht.
- Display zeigt keine Host-Steuerung, keine Tokens und keine Spielplan-Interna.
- Kein zweiter Raum entsteht versehentlich.

### 3. Spieler joinen

Sicherstellen:

- Player joinen per QR oder Code.
- Lobby aktualisiert Display, Host und Player live.
- Disconnects werden sichtbar statt still ignoriert.

Abnahme:

- mehrere Handys koennen nacheinander joinen.
- alle Namen erscheinen sauber.
- Host und Display sehen, wer verbunden oder getrennt ist.

### 4. Eine Frage komplett durchziehen

Sicherstellen:

- Host startet das Spiel.
- Display und Host bekommen vollstaendige Fragedaten.
- Player bekommen nur Controller-Daten.
- Timer kommt vom Server.
- pro Spieler zaehlt nur eine Antwort.
- Player sehen Antwort angenommen oder abgelehnt.
- nach Schliessen der Frage folgt Reveal; Scoreboard folgt nur nach faelligen 5er-Intervallen.

Abnahme:

- eine komplette Frage laeuft ohne manuelle Eingriffe durch.
- spaete Antworten zaehlen nicht.
- doppelte Antworten veraendern den Spielstand nicht.
- unpassende Antworttypen werden nicht gespeichert.

### 5. Mehrere Fragen und Spielende pruefen

Sicherstellen:

- Server wechselt automatisch weiter, wenn alle verbundenen Spieler bereit sind.
- Host kann im Reveal oder nach der Rangliste manuell weiterschalten, falls ein Handy haengen bleibt.
- Scoreboard bleibt konsistent.
- letzte Frage fuehrt in einen Endstand.
- Raum kann am Ende sauber geschlossen werden.

Abnahme:

- kompletter Quizlauf geht durch.
- Rangliste wirkt plausibel.
- es gibt keinen haengenden Zwischenzustand nach der letzten Frage.

## Validierung

Bei laufendem Server:

```bash
corepack pnpm run smoke:local
SMOKE_WS_URL=wss://api.quiz.disaai.de corepack pnpm run smoke:local
```

Vor Abschluss:

```bash
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
```

Vor der Quizrunde zusaetzlich:

- mindestens ein Test mit echten Handys.
- ein Test auf dem vorgesehenen Display/TV.
- ein Test mit Host-Controller auf dem vorgesehenen Geraet.
- bewusst pruefen: WLAN-Aussetzer, Doppelklicks, versehentliches Reload.
- vor dem Abend keinen unnoetigen Ausbau mehr anfangen.

## Tunnel- und Domainbetrieb

Ziel:

- `tv.quiz.disaai.de` -> Display/TV
- `host.quiz.disaai.de` -> Host-Controller
- `play.quiz.disaai.de` -> Player-UI
- `api.quiz.disaai.de` -> Server/API/WebSocket

Details stehen in `docs/DEPLOYMENT-CLOUDFLARE-TUNNEL.md`.

Keine echten Cloudflare-/DNS-Aktionen ohne `[CONFIRM]`. `disaai.de`, `www.disaai.de` und bestehende Disa-AI-Deployments bleiben unberuehrt.

## Was in diesem Plan bewusst nicht vorkommt

- keine Roadmap fuer weitere Modi
- keine Datenbankphase
- keine Durable Objects
- keine Cloud-Hosting-Architektur
- keine Editor-Plattform
- keine Teams, Joker oder Buzzer als Ausbaustufen

Wenn etwas vor dem Abend noch fehlt, gilt:

Erst den bestehenden Quizablauf verlaesslich machen. Nicht das naechste System anfangen.

## Entscheidungsregel fuer weitere Arbeit

Wenn eine geplante Aenderung nicht direkt einem dieser Punkte hilft,

- Display/TV
- Host-Kopplung
- Join
- Lobby
- Frage
- Antwort
- Score
- Stabilitaet auf echten Geraeten

dann ist sie fuer dieses Repo wahrscheinlich nicht dringlich.
