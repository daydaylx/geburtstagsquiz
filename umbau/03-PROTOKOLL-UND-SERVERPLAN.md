# 03 - Protokoll- und Serverplan

## Ziel

Der Server soll neben `host` und `player` eine eigenstaendige Rolle `display` kennen. Das Display initialisiert den Raum und ist danach read-only. Der Host koppelt sich per `hostToken` und steuert das Spiel.

## Kernentscheidungen

- `display:create-room` ersetzt `room:create` als Rauminitialisierungs-Event.
- `host:connect` ist das neue Pairing-Event fuer den Host-Controller.
- `hostToken` und `hostSessionId` sind zwei verschiedene Dinge.
- Kein Event darf eine andere Rolle zur Session-Verdrängung benutzen.

## Shared Types

Anpassen:

- `packages/shared-types/src/common.ts`
  - `CLIENT_ROLES` von `["host", "player"]` auf `["host", "display", "player"]` erweitern.
- `packages/shared-types/src/room.ts`
  - Display- und Host-Felder in `RoomRecord` aufnehmen:
    - `hostToken: string` (fuer initiales Pairing, nicht identisch mit hostSessionId)
    - `hostConnected: boolean`
    - `displayToken: string` (fuer Display-Reconnect)
    - `displaySessionId?: string`
    - `displayConnected: boolean`
  - `hostToken` darf nicht in generische oeffentliche Payloads. Nur Display bekommt ihn fuer den QR.
  - `displayToken` ist nicht fuer Host-Steuerung verwendbar.

Keine neue `Display`-Entity bauen, solange ein Display reicht.

## Shared Protocol – neue Events

### Display -> Server

```text
display:create-room   Display initialisiert Raum (statt room:create durch Host)
connection:resume     Display-Reconnect
```

### Server -> Display

```text
display:room-created  Antwort auf display:create-room mit Tokens und QR-Daten
display:host-paired   Benachrichtigung wenn Host sich gekoppelt hat (Display soll QR ausblenden)
connection:ack        Verbindungsbestaetigung
connection:resumed    nach Reconnect
lobby:update          Spielerstatus, Host-/Display-Verbindungsstatus
game:started          Spielstart
question:show         oeffentliche Frage (NICHT question:controller)
question:timer        Timer-Updates
answer:progress       Anzahl eingegangener Antworten
question:close        Fragenschluss
question:reveal       Aufdeckung mit korrekter Antwort und Erklaerung
score:update          Scoreboard-Update
next-question:ready-progress Ready-Fortschritt
game:finished         Spielende
room:closed           Raum geschlossen
error:protocol        Protokollfehler
```

### Host -> Server

```text
host:connect          Host koppelt sich per hostToken (einmaliges Pairing)
connection:resume     Host-Reconnect per hostSessionId
game:start            Spiel starten
game:next-question    Naechste Frage
room:settings:update  Einstellungen aendern
room:close            Raum schliessen
```

### Server -> Host

```text
host:connected        Antwort auf host:connect mit hostSessionId
connection:ack        Verbindungsbestaetigung
connection:resumed    nach Reconnect
lobby:update          inkl. displayConnected, Spielerstatus
game:started          Spielstart
question:show         vollstaendige Frage (oder kompakter Controller-Snapshot)
answer:progress       Antwortfortschritt
question:close        Fragenschluss
question:reveal       Aufdeckung
score:update          Scoreboard
next-question:ready-progress Ready-Fortschritt
game:finished         Spielende
room:closed           Raum geschlossen
error:protocol        Protokollfehler
```

### Player -> Server (unveraendert)

```text
room:join
answer:submit
next-question:ready
connection:resume
```

## Payloads

### `display:create-room` (Display -> Server)

```ts
{
  clientInfo?: ClientInfo;
}
```

Kein Token, kein Code. Das Display macht einen leeren Aufruf.

### `display:room-created` (Server -> Display)

```ts
{
  roomId: string;
  displaySessionId: string;
  displayToken: string; // fuer Display-Reconnect
  joinCode: string; // fuer Player-QR
  hostToken: string; // fuer Host-QR (einmaliger Pairing-Token)
  playerJoinUrl: string; // optional, falls Server die URL kennt
  hostConnectUrl: string; // optional, falls Server die URL kennt
}
```

**Wichtig:** `hostToken` ist einmalig fuer Pairing. Nach erfolgreichem Host-Pairing kann er server-seitig invalidiert werden. Display blendet den Host-QR danach aus.

### `display:host-paired` (Server -> Display)

```ts
{
  hostConnected: boolean; // true nach erstem Pairing
}
```

Display blendet Host-QR aus, wenn `hostConnected: true`.

### `host:connect` (Host -> Server)

```ts
{
  hostToken: string;
  clientInfo?: ClientInfo;
}
```

### `host:connected` (Server -> Host)

```ts
{
  roomId: string;
  hostSessionId: string;  // Host speichert das fuer Reconnect
  joinCode: string;
  roomState: RoomState;
  gameState?: GameState | null;
}
```

### `connection:resume` (Client -> Server, unveraendert)

Bestehendes Format bleibt. Fuer Display: `sessionId` ist `displaySessionId`. Fuer Host: `sessionId` ist `hostSessionId`.

### `connection:resumed` (Server -> Client)

Bestehende Payload traegt `role: "display"` oder `role: "host"`. Fuer Display sind `playerId`, `playerState`, `currentAnswer` nicht gesetzt.

### `lobby:update`

Host bekommt `displayConnected` und `hostConnected`. Display bekommt Lobbydaten (Spieleranzahl, Name, etc.) ohne interne Host-Kontrolldaten. Fuer v1 kann ein geteiltes `lobby:update` vertretbar sein, solange keine geheimen Daten enthalten sind.

### `room:created` (alt, nicht mehr fuer Primary Flow)

Dieses Event wird nicht mehr als Haupt-Initialisierungs-Response genutzt. `display:room-created` ersetzt es fuer den Display-first-Flow. Wenn `room:create` als Fallback-Event erhalten bleibt, muss klar dokumentiert sein, dass es NICHT der bevorzugte Ablauf ist.

## Event Maps

Anpassen:

- `DISPLAY_TO_SERVER_EVENT_NAMES`: `display:create-room`, `connection:resume`.
- `SERVER_TO_DISPLAY_EVENT_NAMES`: `display:room-created`, `display:host-paired`, `connection:ack`, `connection:resumed`, `lobby:update`, `game:started`, `question:show`, `question:timer`, `answer:progress`, `question:close`, `question:reveal`, `score:update`, `next-question:ready-progress`, `game:finished`, `room:closed`, `error:protocol`.
- `HOST_TO_SERVER_EVENT_NAMES`: `host:connect`, `connection:resume`, `game:start`, `game:next-question`, `room:settings:update`, `room:close`.
- `SERVER_TO_HOST_EVENT_NAMES`: `host:connected`, `connection:ack`, `connection:resumed`, `lobby:update`, `game:started`, `question:show`, `answer:progress`, `question:close`, `question:reveal`, `score:update`, `next-question:ready-progress`, `game:finished`, `room:closed`, `error:protocol`.

Display bekommt `question:show`, nicht `question:controller`. Es sendet keine Host-Events.

## Serverdaten

`apps/server/src/server-types.ts`:

```ts
interface SessionRecord {
  sessionId: string;
  role: "host" | "display" | "player";
  roomId: string;
  playerId?: string;
  socket: TrackedWebSocket | null;
}

interface RoomRecord {
  roomId: string;
  joinCode: string;
  hostToken: string; // einmaliger Pairing-Token
  hostTokenUsed: boolean; // true nach erstem Pairing
  hostSessionId: string; // nach Pairing gesetzt
  hostConnected: boolean;
  hostDisconnectTimer?: ReturnType<typeof setTimeout> | null;
  displayToken: string; // fuer Display-Reconnect
  displaySessionId?: string;
  displayConnected: boolean;
  displayDisconnectTimer?: ReturnType<typeof setTimeout> | null;
  players: Player[];
  // ... gameState etc.
}
```

Host-Grace-Zeit: 5 min. Display-Grace-Zeit: 30s bis 60s. Display-Timeout schliesst keinen Raum.

## Serverfunktionen

Neue oder angepasste Funktionen:

- `generateHostToken()` kryptografisch zufaelliger langer Token.
- `generateDisplayToken()` kryptografisch zufaelliger Token.
- `handleDisplayCreateRoom()` in `display.ts` oder `room.ts`.
  - Erstellt Raum mit joinCode, hostToken, displayToken.
  - Sendet `display:room-created` an Display.
- `handleHostConnect()` in `host.ts` oder `lobby.ts`.
  - Validiert `hostToken`.
  - Prueft `hostTokenUsed`.
  - Erstellt `hostSessionId`, setzt `hostTokenUsed=true`.
  - Sendet `host:connected` an Host.
  - Sendet `display:host-paired` an Display (falls verbunden).
- `resumeSession()` erweitert um `display` und `host`.
- `handleSocketClose()` erweitert um `display` und `host`.
- `closeRoom()` raeumt Host-, Display- und Player-Sessions auf.
- `toLobbyUpdatePayload()` ergaenzt `displayConnected` und `hostConnected`.
- `syncSessionToRoomState()` kennt Display- und Host-Snapshots.

## Broadcast-Trennung

Neue klare Helfer statt allgemeines `broadcastToRoom`:

```ts
sendToHost(room, event, payload)
sendToDisplay(room, event, payload)
sendToPlayers(room, event, payload, options?)
broadcastToPublicScreens(room, event, payload) // Host + Display, falls wirklich gleich
broadcastToRoomParticipants(room, event, payload) // Host + Display + Player, bewusst verwenden
```

Bei jedem Event bewusst entscheiden, wer es bekommt.

## Rechte und Autorisierung

Serverseitig erzwingen:

```text
display:create-room    nur ungebundener Socket (Display ohne Session)
host:connect           nur ungebundener Socket mit gueltigem und unbenutztem hostToken
game:start             nur Host-Session (hostSessionId)
game:next-question     nur Host-Session
room:settings:update   nur Host-Session
room:close             nur Host-Session
answer:submit          nur Player-Session mit passendem playerId
next-question:ready    nur Player-Session
connection:resume      nur Session im passenden Raum; Rolle bestimmt danach Rechte
```

Display muss bei Host-Events `NOT_AUTHORIZED` zurueckbekommen.
Host muss bei Display-Events `NOT_AUTHORIZED` zurueckbekommen.
Player muss bei Host- oder Display-Events `NOT_AUTHORIZED` zurueckbekommen.

Ungueltige oder bereits verwendete `hostToken` werden mit klar benanntem Fehler abgelehnt.

## Reconnect-Snapshot-Regeln fuer Display

Display-Reconnect muss je nach Spielzustand korrekte Events bekommen:

```text
Waiting:       connection:resumed -> lobby:update
QuestionActive: question:show, question:timer, answer:progress
AnswerLocked:  question:show, question:close
Revealing:     question:show, question:close, question:reveal
Scoreboard:    question:show, question:close, question:reveal, score:update, next-question:ready-progress
Completed:     game:finished
```

## Tests

Ergaenzen:

- Schema akzeptiert `display:create-room`.
- Schema akzeptiert `display:room-created`.
- Schema akzeptiert `host:connect`.
- Schema akzeptiert `host:connected`.
- Schema akzeptiert `display:host-paired`.
- `connection:resumed` akzeptiert `role: "display"`.
- Display darf `game:start` nicht.
- Display darf `room:settings:update` nicht.
- Display darf `answer:submit` nicht.
- Display darf `game:next-question` nicht.
- Host darf `display:create-room` nicht.
- Player darf `host:connect` nicht.
- Ungueltige `hostToken` werden abgelehnt.
- Bereits verwendete `hostToken` werden abgelehnt.
- Nach Host-Pairing: `display:host-paired` geht an Display.
- Host und Display koennen gleichzeitig verbunden sein.
- Display-Reconnect verdraengt Host nicht.
- Host-Reconnect verdraengt Display nicht.
- `closeRoom` raeumt Host-, Display- und Player-Sessions auf.
- Display bekommt `question:show`, nicht `question:controller`.

## Abnahme

- Display oeffnet TV-Seite, klickt "Quizraum erstellen", sieht Player-QR und Host-QR.
- Host scannt Host-QR, koppelt sich, Host-QR verschwindet auf TV.
- Display zeigt Lobby, Frage, Reveal, Scoreboard, Endstand.
- Display hat keine Steuerrechte.
- Player-Flow bleibt unveraendert funktionsfaehig.
- Reconnect fuer alle drei Rollen funktioniert ohne gegenseitige Verdraengung.
