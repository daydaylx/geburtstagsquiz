# 03 - Protokoll- und Serverplan

## Ziel

Der Server soll neben `host` und `player` eine eigenstaendige Rolle `display` kennen. Das Display ist read-only, bekommt eigene Sessiondaten und wird separat broadcastet.

## Shared Types

Anpassen:

- `packages/shared-types/src/common.ts`
  - `CLIENT_ROLES` von `["host", "player"]` auf `["host", "display", "player"]` erweitern.
- `packages/shared-types/src/room.ts`
  - Display-Felder in `Room` aufnehmen, wenn diese in Payloads oder Shared-Typen gebraucht werden:
    - `displaySessionId?: string`
    - `displayConnected: boolean`
  - `displayToken` nicht in generische oeffentliche Room-Payloads geben, ausser explizit fuer Host.

Keine neue `Display`-Entity bauen, solange ein Display reicht.

## Shared Protocol

Neue Events:

```text
display:connect       Client -> Server
display:connected     Server -> Display
display:disconnected  Server -> Host
```

Optional spaeter, aber fuer v1 nicht noetig:

```text
display:state-sync
```

`syncSessionToRoomState` kann den Snapshot liefern; kein separates Sync-Event bauen, solange die bestehenden Snapshot-Events reichen.

## Payloads

### `room:created`

Host braucht zusaetzlich:

```ts
displayToken: string;
displayUrl?: string; // besser im Client bauen, falls URL-Konfig dort lebt
```

Empfehlung: Server sendet nur `displayToken`; Host baut Display-Link aus `VITE_DISPLAY_URL`.

### `display:connect`

```ts
{
  displayToken: string;
  clientInfo?: ClientInfo;
}
```

### `display:connected`

```ts
{
  roomId: string;
  sessionId: string;
  joinCode: string;
  roomState: RoomState;
  gameState?: GameState | null;
}
```

### `connection:resumed`

Bestehende Payload kann `role: "display"` tragen. Fuer Display sind `playerId`, `playerState` und `currentAnswer` nicht gesetzt.

### `lobby:update`

Host sollte `displayConnected` sehen. Display braucht Lobbydaten ebenfalls, aber ohne Host-internen Ballast. Fuer v1 ist ein gemeinsames `lobby:update` vertretbar, wenn keine geheimen Daten enthalten sind.

## Event Maps

Anpassen:

- `DISPLAY_TO_SERVER_EVENT_NAMES`: `display:connect`, `connection:resume`.
- `SERVER_TO_DISPLAY_EVENT_NAMES`: `connection:ack`, `connection:resumed`, `display:connected`, `lobby:update`, `game:started`, `question:show`, `question:timer`, `answer:progress`, `question:close`, `question:reveal`, `score:update`, `next-question:ready-progress`, `game:finished`, `room:closed`, `error:protocol`.
- `CLIENT_TO_SERVER_EVENT_NAMES`: Host + Display + Player.
- `SERVER_TO_CLIENT_EVENT_NAMES`: Host + Display + Player.

Display bekommt `question:show`, nicht `question:controller`, weil es die oeffentliche Frage zeigen soll. Es darf aber keine Client->Server-Hostevents senden.

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
  displayToken: string;
  displaySessionId?: string;
  displayConnected: boolean;
  displayDisconnectTimer?: ReturnType<typeof setTimeout> | null;
}
```

Display-Grace kann kurz sein, z. B. 30s. Ein Display-Timeout darf den Raum nicht schliessen.

## Serverfunktionen

Neue oder angepasste Funktionen:

- `generateDisplayToken()` in `room.ts` oder kleinem lokalen Helper.
- `handleDisplayConnect()` in `lobby.ts` oder neuer `display.ts`.
- `resumeSession()` erweitert um `display`.
- `handleSocketClose()` erweitert um `display`.
- `closeRoom()` entfernt Display-Session und schliesst Display-Socket.
- `toLobbyUpdatePayload()` ergaenzt `displayConnected`.
- `syncSessionToRoomState()` kennt Display-Snapshots.

## Broadcast-Trennung

`broadcastToRoom` nicht weiter als allgemeine Loesung ausbauen. Neue klare Helfer:

```ts
sendToHost(room, event, payload)
sendToDisplay(room, event, payload)
sendToPlayers(room, event, payload, options?)
broadcastToPublicScreens(room, event, payload) // Host + Display, falls wirklich gleich
broadcastToRoomParticipants(room, event, payload) // Host + Display + Player, bewusst verwenden
```

Wichtige Regel: Bei jedem Event bewusst entscheiden, wer es bekommt.

## Rechte und Autorisierung

Serverseitig erzwingen:

- `room:create`: nur ungebundener Socket.
- `room:settings:update`, `game:start`, `game:next-question`, `room:close`: nur Host-Session.
- `answer:submit`, `next-question:ready`: nur Player-Session mit passendem `playerId`.
- `display:connect`: nur ungebundener Socket mit gueltigem `displayToken`.
- `connection:resume`: nur Session im passenden Raum; Rolle bestimmt danach die Rechte.

Display muss bei Host-Events `NOT_AUTHORIZED` bekommen.

## Reconnect-Risiken

Riskanteste Stelle ist `apps/server/src/connection.ts`, weil dort Zustand fuer laufende Frage, Reveal, Scoreboard und Endstand rekonstruiert wird.

Display-Snapshot-Regeln:

- Waiting: `display:connected` oder `connection:resumed`, danach `lobby:update`.
- QuestionActive: `question:show`, `question:timer`, `answer:progress`.
- AnswerLocked: `question:show`, `question:close`.
- Revealing: `question:show`, `question:close`, `question:reveal`.
- Scoreboard: `question:show`, `question:close`, `question:reveal`, `score:update`, `next-question:ready-progress`.
- Completed: `game:finished`.

## Tests

Ergaenzen:

- Schema akzeptiert `display:connect`.
- Schema akzeptiert `display:connected`.
- `connection:resumed` akzeptiert `role: "display"`.
- Display darf `game:start`, `room:settings:update`, `answer:submit`, `next-question:ready` nicht ausfuehren.
- Host und Display koennen gleichzeitig verbunden sein.
- Display-Reconnect verdraengt Host nicht.
- Host-Reconnect verdraengt Display nicht.
- `closeRoom` raeumt Display-Session auf.
- Display bekommt bei laufender Frage `question:show`, nicht `question:controller`.

## Abnahme

- Ein Host erstellt einen Raum und sieht den Display-Link.
- Ein Display verbindet sich mit `displayToken`.
- Display zeigt Lobby, Frage, Reveal, Scoreboard und Endstand.
- Display hat keine Steuerrechte.
- Player-Flow bleibt unveraendert funktionsfaehig.

