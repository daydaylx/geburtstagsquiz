# Audit: Runtime-Stabilität & Code-Qualität

**Datum:** 2026-05-17
**Scope:** Alle 7 Bereiche (Server, Shared Packages, 3 Web-Apps, Styles/Config)
**Methode:** Ein Durchlauf, jeder Fund getaggt mit `runtime-risk` / `code-quality` / `both`
**Basis:** Typecheck ✅, 251 Tests ✅, Lint ✅

---

## Zusammenfassung

| Schwere | Anzahl | davon Runtime-Risk |
|---------|--------|--------------------|
| Critical | 1 | 1 |
| High | 7 | 6 |
| Medium | 23 | 12 |
| Low | 35 | 8 |
| **Gesamt** | **66** | **27** |

---

## Top 10 Befunde

### 1. [B5-F1] Display ERROR_PROTOCOL ohne Session-Cleanup bei ROOM_NOT_FOUND — CRITICAL
**Datei:** `apps/web-display/src/hooks/useDisplaySession.ts:491-497`
Der Display ERROR_PROTOCOL-Handler prueft nicht auf SESSION_NOT_FOUND oder ROOM_NOT_FOUND. Bei einem Serverneustart (In-Memory-Daten weg) sendet das Display CONNECTION_RESUME mit der alten Session. Der Server antwortet mit SESSION_NOT_FOUND, aber das Display behaelt die gespeicherte Session in localStorage. Bei jedem Reconnect oder Seitenrefresh wird erneut mit der ungueltigen Session resumed. Das Display hat keinen Rueckweg zum Setup-Screen. Host und Player bereinigen korrekt bei diesen Fehlercodes.

### 2. [B1-F1] closeQuestion kann doppelt aufgerufen werden (all-players-answered + timer) — HIGH
**Datei:** `apps/server/src/game.ts:663-665`
Wenn alle verbundenen Spieler antworten (handleAnswerEligibilityChanged → closeQuestion) und fast gleichzeitig der questionTimer ablaeuft, wird closeQuestion zweimal aufgerufen. Der Guard `if (room.gameState !== GameState.QuestionActive) return;` (Zeile 681) verhindert eine korrupte State-Aenderung, aber die Timer-Bereinigung und der closeQuestion-Body werden doppelt ausgefuehrt (QUESTION_CLOSE wird nicht doppelt gesendet wegen des Guards). Bei Node.js single-threaded IO ist die Wahrscheinlichkeit gering, aber nicht null.

### 3. [B1-F2] evaluateQuestion switch hat keinen default/assertUnreachable — HIGH
**Datei:** `apps/server/src/game.ts:717-730`
Der switch in evaluateQuestion deckt alle 6 QuestionTypes ab, hat aber keinen default-Case mit assertUnreachable. Wenn ein neuer QuestionType zum Enum hinzugefuegt wird, kompiliert TypeScript ohne Fehler, aber evaluateQuestion gibt undefined zurueck. Das fuehrt zu einem Absturz beim Zugriff auf roundResult.correctAnswer.

### 4. [B3-F1] loadDefaultQuiz() auf Modulebene ohne try-catch — HIGH
**Datei:** `apps/server/src/quiz-data.ts:429`
loadDefaultQuiz() wird auf Modulebene ohne try-catch aufgerufen. Eine fehlerhafte JSON-Datei (Syntaxfehler, falsche Struktur) fuehrt zu einem unhandled exception und Serverabsturz beim Start.

### 5. [B5-F2] Host behandelt QUESTION_CLOSE nicht — HIGH
**Datei:** `apps/web-host/src/hooks/useHostSession.ts:200-453`
SERVER_TO_HOST_EVENT_NAMES enthaelt QUESTION_CLOSE, aber im switch fehlt ein case dafuer. remainingMs wird nicht auf 0 gesetzt. Der Host zeigt eine veraltete Countdown-Zeit waehrend die Frage bereits geschlossen ist. Display und Player setzen remainingMs korrekt auf 0.

### 6. [B5-F3] Host CONNECTION_RESUMED setzt Screen ohne zugehoerige Daten — HIGH
**Datei:** `apps/web-host/src/hooks/useHostSession.ts:275-291`
Host CONNECTION_RESUMED setzt bei `else setScreen("question")` den Screen ohne dass question gesetzt ist (Page-Refresh-Szenario). Der Host zeigt einen leeren Question-Screen bis QUESTION_SHOW vom Server nachkommt. Der Display loest das mit isResumingRef eleganter.

### 7. [B5-F4] Display CONNECTION_RESUMED setzt keinen Screen bei InGame — HIGH
**Datei:** `apps/web-display/src/hooks/useDisplaySession.ts:249-254`
Nach einem Page-Refresh bei InGame-Zustand startet der Display-Screen als "setup". Wenn der Server in_game ist, bleibt das Display auf "setup" bis ein konkretes Event eintrifft. Bei langsamer Verbindung sieht das Publikum den Setup-Screen.

### 8. [B5-F5] Player CONNECTION_RESUMED wertet gameState nicht aus — HIGH
**Datei:** `apps/web-player/src/hooks/usePlayerSession.ts:291-318`
Der Player setzt bei CONNECTION_RESUMED keinen Screen basierend auf gameState. Nach Page-Refresh startet screen="lobby". Wenn das Spiel laeuft, bleibt der Player auf "lobby" bis QUESTION_CONTROLLER eintrifft. Bei revealing/scoreboard ohne nachfolgendes QUESTION_CONTROLLER bleibt der Player stecken.

### 9. [B1-F3] closeRoom loescht Spieler nicht aus players-Array — HIGH
**Datei:** `apps/server/src/room.ts:32-110`
closeRoom() bereinigt Timer, Sessions und Maps korrekt, aber room.players behaelt seine Eintraege. Da roomsById.delete(room.id) danach aufgerufen wird (Zeile 95), ist der Room-Record kurzzeitig GC-reachable mit verwaisten Spieler-Eintraegen. Funktionell unkritisch, da der Raum nach closeRoom unzugaenglich ist, aber bei einem Shutdown-Race (process.exit-Timeout) koennten timer-Callbacks noch auf die Spieler zugreifen.

### 10. [B4-F1] useWebSocket shouldReconnectRef wird nicht zurueckgesetzt — MEDIUM (aber hochrelevant in Dev)
**Datei:** `packages/shared-hooks/src/useWebSocket.ts:101-108`
shouldReconnectRef.current wird in der Cleanup-Funktion auf false gesetzt, aber nie wieder auf true beim Re-Run des Effects. In React 18+ StrictMode (Entwicklung) fuehrt dies dazu, dass nach dem ersten Unmount/Remount keine Reconnects mehr stattfinden. In Produktion (kein StrictMode) tritt das Problem nicht auf.

---

## Alle Befunde

---

### Bereich 1: Server – Spiellogik & State

#### [B1-F1] closeQuestion doppelter Aufruf bei all-players-answered + timer
- **Datei:** `apps/server/src/game.ts:663-665, 680-681`
- **Kategorie:** runtime-risk
- **Schwere:** high
- **Beschreibung:** Wenn alle Spieler antworten und gleichzeitig der Timer ablaeuft, kann closeQuestion zweimal aufgerufen werden. Der State-Guard verhindert korrupte Zustaende, aber QUESTION_CLOSE koennte zweimal gesendet werden (wenn der erste Aufruf gameState noch nicht gesetzt hat).
- **Empfehlung:** In handleAnswerEligibilityChanged vor dem closeQuestion-Aufruf pruefen, ob room.gameState noch QuestionActive ist (ist bereits so, aber explizit dokumentieren). Alternativ eine Flag `isClosingQuestion` auf RoomRecord setzen.

#### [B1-F2] evaluateQuestion switch ohne exhaustiveness-Check
- **Datei:** `apps/server/src/game.ts:717-730`
- **Kategorie:** both
- **Schwere:** high
- **Beschreibung:** Switch hat keinen default-Case. Bei neuem QuestionType gibt die Funktion undefined zurueck → Absturz.
- **Empfehlung:** `default: { const _exhaustive: never = question.type; throw new Error("Unknown type"); }` ergaenzen.

#### [B1-F3] closeRoom loescht Spieler nicht aus players-Array
- **Datei:** `apps/server/src/room.ts:32-110`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** closeRoom() bereinigt Timer und Sessions, aber room.players behaelt Eintraege. Nach roomsById.delete ist der Raum unzugaenglich, aber bei Shutdown-Races koennten Callbacks noch auf Spieler zugreifen.
- **Empfehlung:** `room.players.length = 0;` am Ende von closeRoom ergaenzen.

#### [B1-F4] Timer-Tick sendet QUESTION_TIMER nach closeQuestion
- **Datei:** `apps/server/src/game.ts:619-633`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** timerTickInterval (500ms) und questionTimer koennen zeitlich nahe beieinander feuern. Wenn timerTickInterval 100ms nach closeQuestion feuert, prueft es ms <= 0, clearing sich selbst, aber hat bereits QUESTION_TIMER mit remainingMs=0 gesendet. Das QUESTION_TIMER mit 0ms ist redundant, da QUESTION_CLOSE bereits gesendet wurde. Client-seitig kein Problem, aber unnoetiger Traffic.
- **Empfehlung:** In timerTickInterval-Callback zusaetzlich pruefen: `if (room.gameState !== GameState.QuestionActive) { clearInterval(...); return; }`.

#### [B1-F5] activateQuestion setzt player.state ohne Race-Schutz
- **Datei:** `apps/server/src/game.ts:600-604`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Spieler im Disconnected-Zustand werden korrekt uebersprungen (`player.state !== PlayerState.Disconnected`). Aber Spieler, die waehrend der Frage disconnecten und reconnecten, koennten ihren State inkorrekt zurueckbekommen. Die Reconnect-Logik (lobby.ts:287-293) behandelt das korrekt.
- **Empfehlung:** Keine Aenderung noetig. Code ist korrekt.

#### [B1-F6] revealTimer ohne State-Guard beim Feuern
- **Datei:** `apps/server/src/game.ts:784`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** `room.revealTimer = setTimeout(() => advanceAfterReveal(room), revealDurationMs)` — advanceAfterReveal hat einen State-Guard (Zeile 861), aber der Timer wird nicht genullt bevor advanceAfterReveal laeuft. Wenn advanceAfterReveal durch manuelle Host-Aktion und gleichzeitig durch den Timer aufgerufen wird, wird der State-Guard die zweite Ausfuehrung stoppen.
- **Empfehlung:** Den Timer-Callback mit null-Setzung wrappen: `room.revealTimer = setTimeout(() => { room.revealTimer = null; advanceAfterReveal(room); }, ...)`.

#### [B1-F7] countdownTimer feuert nach Raum-Schliessung
- **Datei:** `apps/server/src/game.ts:571-584`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** Der countdownTimer-Callback prueft korrekt `room.state !== RoomState.InGame` (Zeile 575) und `question.id !== question.id` (Zeile 578). Wenn der Raum in den 2.5s Countdown-Phase geschlossen wird, wird der Timer-Callback stillschweigend beendet. Gut implementiert.
- **Empfehlung:** Keine Aenderung noetig. Positiv hervorheben.

#### [B1-F8] handleGameRestart bereinigt nicht alle potentiellen Timer
- **Datei:** `apps/server/src/game.ts:960-963`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** handleGameRestart bereinigt playerDisconnectTimers (Zeile 960-963). clearActiveRoomTimers (Zeile 958) bereinigt countdownTimer, questionTimer, timerTickInterval, revealTimer, completedRoomTtlTimer. Die Grace-Timer (displayDisconnectTimer, hostDisconnectTimer) werden nicht explizit bereinigt. Bei einem Restart koennte der displayDisconnectTimer noch laufen, aber da das Display verbunden bleibt, ist das unkritisch.
- **Empfehlung:** displayDisconnectTimer und hostDisconnectTimer in handleGameRestart explizit bereinigen fuer defensive Robustheit.

#### [B1-F9] getAuthorizedHostRoom dupliziert Rollen-Auth
- **Datei:** `apps/server/src/game.ts:195-231`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** getAuthorizedHostRoom fuehrt eine eigene Rollen- und Raum-Pruefung durch, obwohl isEventAllowedForRole bereits in index.ts vor dem Dispatch prueft. Die doppelte Pruefung ist redundant aber sicher (Defense in Depth).
- **Empfehlung:** Beibehalten als Defense in Depth. Kurzkommentar ergaenzen.

#### [B1-F10] submittedAtMs kann negativ werden bei clock skew
- **Datei:** `apps/server/src/game.ts:434`
- **Kategorie:** runtime-risk
- **Schwere:** low
- **Beschreibung:** `submittedAtMs: Math.max(0, now - (room.questionStartedAt ?? now))` — Math.max(0, ...) verhindert negative Werte. room.questionStartedAt ?? now faengt null ab. Korrekt implementiert.
- **Empfehlung:** Keine Aenderung noetig.

#### [B1-F11] syncSessionToRoomState verwendet room.resolvedGamePlan!
- **Datei:** `apps/server/src/connection.ts:225`
- **Kategorie:** code-quality
- **Schwere:** medium
- **Beschreibung:** Non-null Assertion `room.resolvedGamePlan!` ohne vorherige Pruefung. Wenn syncSessionToRoomState aufgerufen wird bevor resolvedGamePlan gesetzt ist (theoretisch bei InGame-State), wuerde undefined serialisiert. In der Praxis geschieht das nur bei InGame-Zustand, wo resolvedGamePlan immer gesetzt ist.
- **Empfehlung:** Guard ergaenzen: `if (!room.resolvedGamePlan) return;` vor Zeile 219.

#### [B1-F12] syncSessionToRoomState switch hat keinen default
- **Datei:** `apps/server/src/connection.ts:228-331`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Der switch ueber room.gameState hat keinen default-Case. Wenn GameState um einen Wert erweitert wird (z.B. "paused"), wuerde der Spieler nach Reconnect keine Events erhalten.
- **Empfehlung:** default-Case mit console.warn ergaenzen.

#### [B1-F13] Resume-Session zeigt game state-Ergebnisse nicht auf dem Display an
- **Datei:** `apps/server/src/connection.ts:273-296`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Bei Reveal-State sendet syncSessionToRoomState korrekt QUESTION_CLOSE, QUESTION_REVEAL und NEXT_QUESTION_READY_PROGRESS. Bei Scoreboard-State sendet es zusaetzlich SCORE_UPDATE. Vollstaendig und korrekt.
- **Empfehlung:** Keine Aenderung noetig. Positiv hervorheben.

#### [B1-F14] session.ts: displayDisconnectTimer setzt displayConnected doppelt
- **Datei:** `apps/server/src/session.ts:38-45`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Zeile 38 setzt `room.displayConnected = false` und der Timer-Callback (Zeile 45) setzt es erneut auf false. Redundant aber harmlos.
- **Empfehlung:** Die Zeile 45 im Timer-Callback ist redundant, da bereits in Zeile 38 gesetzt. Kann entfernt werden.

#### [B1-F15] handleSocketClose prueft nicht auf aktiven Frage-Timer bei Host-Disconnect
- **Datei:** `apps/server/src/session.ts:58-78`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** Wenn der Host waehrend einer aktiven Frage disconnectet, laeuft der hostDisconnectTimer (5min). Die Frage-Timer (questionTimer, timerTickInterval) laufen weiter. Wenn die Grace-Zeit ablaeuft, wird closeRoom aufgerufen, das die Timer bereinigt. Wenn der Host aber reconnectet (innerhalb von 5min), laeuft das Spiel normal weiter. Korrekt implementiert.
- **Empfehlung:** Keine Aenderung noetig.

#### [B1-F16] lobby.ts: Host-Reconnect nach Host-Create-Room Cleanup loescht alte Session
- **Datei:** `apps/server/src/lobby.ts:150-158`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Bei handleHostConnect wird eine bestehende alte Host-Session bereinigt (Zeile 151-157). Das ist korrekt und verhindert Session-Leaks.
- **Empfehlung:** Keine Aenderung noetig. Positiv hervorheben.

#### [B1-F17] lobby.ts: Display-Connect bei InGame blockiert
- **Datei:** `apps/server/src/lobby.ts:610-617`
- **Kategorie:** runtime-risk
- **Schwere:** low
- **Beschreibung:** Display kann sich nur in RoomState.Waiting verbinden. Wenn das Display waehrend des Spiels die Verbindung verliert und neu verbindet, muss es CONNECTION_RESUME nutzen (ueber displayToken). Das ist korrekt implementiert.
- **Empfehlung:** Keine Aenderung noetig.

#### [B1-F18] room.ts: generateUniqueJoinCode theoretische Endlosschleife
- **Datei:** `apps/server/src/room.ts:19-30`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Die do-while-Schleife generiert Join-Codes, bis ein eindeutiger gefunden wird. Bei Kollisionen (extrem unwahrscheinlich bei 6 Zeichen aus 32-stelligen Alphabet = ~1 Milliarde Kombinationen) wuerde die Schleife weiterlaufen. Kein Max-Retry-Limit.
- **Empfehlung:** Max-Retry-Limit (z.B. 100) ergaenzen mit Fehler-Throw bei Ueberschreitung.

---

### Bereich 2: Server – Message-Dispatch

#### [B2-F1] switch(event) hat keinen default-Zweig
- **Datei:** `apps/server/src/index.ts:236-308`
- **Kategorie:** code-quality
- **Schwere:** medium
- **Beschreibung:** Der switch hat keinen default-Zweig. Ein unbekanntes Event wird stillschweigend ignoriert. Alle 17 CLIENT_TO_SERVER_EVENT_NAMES sind als Cases abgedeckt, aber es gibt keinen TypeScript-Schutz bei neuen Events.
- **Empfehlung:** default-Zweig mit console.warn oder assertUnreachable ergaenzen.

#### [B2-F2] isEventAllowedForRole erzeugt Arrays bei jedem Aufruf
- **Datei:** `apps/server/src/role-auth.ts:14-38`
- **Kategorie:** both
- **Schwere:** medium
- **Beschreibung:** hostOnlyEvents/playerOnlyEvents/displayOnlyEvents werden bei jedem Aufruf per Spread neu erstellt. Bei jedem eintreffenden Message werden drei Arrays erzeugt und mit .includes() durchsucht.
- **Empfehlung:** Arrays als module-level ReadonlySets extrahieren.

#### [B2-F3] socket.on('error') ohne Bereinigung
- **Datei:** `apps/server/src/index.ts:110-115`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** socket.on('error') loggt nur, loest aber keine Bereinigung aus. Der 'error'-Event kann 'close' verhindern, wodurch die Session im Inkonsistenzzustand bleibt, bis der Heartbeat-Timer greift (15s).
- **Empfehlung:** Im error-Handler socket.terminate() aufrufen.

#### [B2-F4] Heartbeat-Intervall ohne Pufferzeit
- **Datei:** `apps/server/src/index.ts:123-135`
- **Kategorie:** runtime-risk
- **Schwere:** low
- **Beschreibung:** Bei Serverlast kann der pong-Callback verzoegert sein. Beim naechsten Intervall wird socket.terminate() aufgerufen, selbst wenn der Client puenktlich geantwortet hat.
- **Empfehlung:** Grace-Periode einbauen (erst nach 2 verpassten Pings auf false setzen).

#### [B2-F5] TrackedWebSocket-Cast kurzzeitig typ-unsafe
- **Datei:** `apps/server/src/index.ts:80-87`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** websocket wird as TrackedWebSocket gecastet, bevor Properties gesetzt werden. Kurzes Fenster mit Typverletzung.
- **Empfehlung:** Kosmetisch. Factory-Funktion waere sauberer.

#### [B2-F6] handleRoomClose in index.ts statt lobby.ts
- **Datei:** `apps/server/src/index.ts:311-335`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** handleRoomClose ist die einzige Handler-Funktion, die nicht in lobby.ts oder game.ts ausgelagert ist. Zusätzliche doppelte Rollenpruefung.
- **Empfehlung:** Nach lobby.ts verschieben und doppelte Rollenpruefung entfernen.

#### [B2-F7] sendEvent gibt keinen Feedback bei gescheiterter Zustellung
- **Datei:** `apps/server/src/protocol.ts:20-23`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** sendEvent warnt nur, wenn der Socket nicht OPEN ist. Kein Rueckgabewert fuer den Aufrufer.
- **Empfehlung:** boolean-Rueckgabewert einfuegen.

#### [B2-F8] rawMessage.toString() ohne Binary-Check
- **Datei:** `apps/server/src/index.ts:102-104`
- **Kategorie:** runtime-risk
- **Schwere:** low
- **Beschreibung:** rawMessage.toString() kann fehlschlagen, wenn die Nachricht Binärdaten enthaelt. Der Fehler wird durch parseClientToServerEnvelope abgefangen, aber die Fehlermeldung ist irrefuehrend.
- **Empfehlung:** Pruefen, ob die Nachricht ein String ist, bevor toString() aufgerufen wird.

#### [B2-F9] unhandledRejection Shutdown-Timer-Race
- **Datei:** `apps/server/src/index.ts:156-164`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** Bei uncaughtException/unhandledRejection wird shutdown(1) mit 1s process.exit-Timeout aufgerufen. Alle Raeume werden geschlossen, aber ob clearActiveRoomTimers innerhalb von 1s abgeschlossen ist, haengt von der Anzahl offener Raeume ab.
- **Empfehlung:** Den 1s-Timeout erhoehen, wenn viele Raeume offen sind.

#### [B2-F10] Origin-Check akzeptiert undefined
- **Datei:** `apps/server/src/index.ts:73-78`
- **Kategorie:** runtime-risk
- **Schwere:** low
- **Beschreibung:** isOriginAllowed gibt bei undefined Origin true zurueck. Browser senden immer Origin, aber WebSocket-Clients (Skripte) nicht.
- **Empfehlung:** Fuer lokalen Abend akzeptabel. Bei Bedarf loggen.

---

### Bereich 3: Server – Validierung & Scoring

#### [B3-F1] loadDefaultQuiz() ohne try-catch auf Modulebene
- **Datei:** `apps/server/src/quiz-data.ts:429`
- **Kategorie:** runtime-risk
- **Schwere:** high
- **Beschreibung:** Eine fehlerhafte JSON-Datei fuehrt zu unhandled exception beim Serverstart.
- **Empfehlung:** Try-catch mit spezifischer Fehlermeldung ergaenzen.

#### [B3-F2] transformQuestion nutzt Heuristik statt raw type als Primaerdiskriminator
- **Datei:** `apps/server/src/quiz-data.ts:344-368`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** Die Reihenfolge hasCorrectOption → hasNumericAnswer → ... statt raw type kann bei unguenstiger Datenkonstellation zur falschen Typ-Klassifizierung fuehren.
- **Empfehlung:** Den raw type als primaeren Switch verwenden und strukturelle Validierung nur zur Konsistenzpruefung einsetzen.

#### [B3-F3] isAnswerValidForQuestion ohne exhaustiveness-Check
- **Datei:** `apps/server/src/answer-validation.ts:3-31`
- **Kategorie:** code-quality
- **Schwere:** medium
- **Beschreibung:** Switch hat keinen default-Case. Bei neuem QuestionType gibt die Funktion undefined zurueck (falsy → Antwort wird abgelehnt).
- **Empfehlung:** default mit assertUnreachable ergaenzen.

#### [B3-F4] toQuestionControllerPayload Fallback durchreichten unbekannten Typs
- **Datei:** `apps/server/src/question-payloads.ts:129-134`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** Bei unbekanntem QuestionType wird das type-Feld durchgereicht. Der resultierende Payload passt nicht zum Zod-Schema → Client-Parse-Fehler.
- **Empfehlung:** Fallback durch exhaustiveness-Check ersetzen (throw bei unerwartetem Typ).

#### [B3-F5] getSortedScoreboard ohne geteilte Raenge
- **Datei:** `apps/server/src/game-scoreboard.ts` + `room-selectors.ts:24`
- **Kategorie:** both
- **Schwere:** medium
- **Beschreibung:** Spieler mit identischer Punktezahl bekommen aufsteigende Raenge (1, 2, 3) statt geteilter Raenge (1, 1, 3). buildScoreChanges meldet falsche Rangwechsel bei gleichem Score.
- **Empfehlung:** Geteilte Raenge (dense_rank) implementieren oder Filter in buildScoreChanges anpassen.

#### [B3-F6] mostCorrectEntry bei Gleichstand willkuerlich
- **Datei:** `apps/server/src/game-scoreboard.ts:82`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Bei Gleichstand wird der zuerst gefundene Spieler gewaehlt.
- **Empfehlung:** Alle Spieler mit Maximalwert zurueckgeben oder Tiebreaker verwenden.

#### [B3-F7] fastest answer bei Gleichstand willkuerlich
- **Datei:** `apps/server/src/game-scoreboard.ts:73-80`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Bei gleicher minimaler Antwortzeit wird der zuerst gefundene Spieler gewaehlt.
- **Empfehlung:** Sekundaeren Tiebreaker verwenden.

#### [B3-F8] SCOREBOARD_INTERVAL = 5 ist Magic Number
- **Datei:** `apps/server/src/game-scoreboard.ts:5`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Weder in config.ts noch in shared-types definiert.
- **Empfehlung:** Nach config.ts verschieben.

#### [B3-F9] TYPE_WEIGHTS/TYPE_CAPS nicht dokumentiert
- **Datei:** `apps/server/src/game-plan.ts:24-51, 217-223`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** quick_dirty und chaos_party haben keine TYPE_CAPS-Einträge (unlimitiert). Fehlende Typen bekommen 0.1-Gewicht.
- **Empfehlung:** Kurzkommentar ergaenzen.

#### [B3-F10] categoryId optional in QuestionMetadata aber immer gesetzt
- **Datei:** `apps/server/src/game-plan.ts:141-152`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** filterQuestionsForPlan filtert questions mit `categoryId !== undefined`, aber quiz-data.ts setzt categoryId immer. Inkonistenz zwischen Typ und Realitaet.
- **Empfehlung:** categoryId als Pflichtfeld definieren.

---

### Bereich 4: Shared Packages

#### [B4-F1] useWebSocket shouldReconnectRef nicht zurueckgesetzt
- **Datei:** `packages/shared-hooks/src/useWebSocket.ts:101-108`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** shouldReconnectRef.current wird in Cleanup auf false gesetzt, aber nie auf true beim Re-Run des Effects. In React 18+ StrictMode keine Reconnects nach erstem Unmount/Remount.
- **Empfehlung:** `shouldReconnectRef.current = true;` als erste Zeile im useEffect ergaenzen.

#### [B4-F2] Schema-Maps haben stillschweigende Kollisionen bei merged keys
- **Datei:** `packages/shared-protocol/src/schemas.ts:820-824, 899-903`
- **Kategorie:** both
- **Schwere:** medium
- **Beschreibung:** CLIENT_TO_SERVER_EVENT_SCHEMAS merged drei Rollen-Maps via Spread. `connection:resume` erscheint 3x. Letzter Spread gewinnt stillschweigend. Aktuell sicher, aber bei Divergenz unsichtbar.
- **Empfehlung:** Kollision dokumentieren oder explizite Key-Liste verwenden.

#### [B4-F3] Estimate-Controller-Schema dupliziert BaseFields
- **Datei:** `packages/shared-protocol/src/schemas.ts:554-566`
- **Kategorie:** code-quality
- **Schwere:** medium
- **Beschreibung:** Estimate-Variante dupliziert 9 Felder statt spread pattern wie alle anderen 5 Varianten. Bei Aenderung von questionControllerBaseFields driftet Estimate.
- **Empfehlung:** `...questionControllerBaseFields` verwenden wie bei allen anderen.

#### [B4-F4] RoomResetPayloadSchema nutzt idSchema statt joinCodeSchema
- **Datei:** `packages/shared-protocol/src/schemas.ts:767-773`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** joinCode nutzt idSchema statt joinCodeSchema. Malformed join code wuerde hier passieren.
- **Empfehlung:** joinCodeSchema verwenden fuer Konsistenz.

#### [B4-F5] Systematische strictness-Luecke zwischen TS-Interfaces und Zod-Schemas
- **Datei:** `packages/shared-types/src/scoreboard.ts` vs `packages/shared-protocol/src/schemas.ts`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** TS-Interfaces nutzen bare `number` fuer score/rank/delta, waehrend Schemas `z.number().int().nonnegative()` fordern. Schemas sind korrekt, Typen zu permissiv.
- **Empfehlung:** JSDoc-Annotationen oder Branded Types ergaenzen.

#### [B4-F6] LobbyPlayer/LobbyCategory fehlen in shared-types
- **Datei:** `packages/shared-protocol/src/schemas.ts:198-205, 407-412`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** LobbyPlayerSchema und LobbyCategorySchema haben keine korrespondierenden Interfaces in shared-types. Typen nur via Zod-Inferenz verfuegbar.
- **Empfehlung:** Interfaces in shared-types ergaenzen.

#### [B4-F7] PlayerState.Connected wird nie in Protokoll-Schemas verwendet
- **Datei:** `packages/shared-types/src/enums.ts:19`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** "connected" ist ein Enum-Wert, der nie als Literal in Protokoll-Schemas auftaucht.
- **Empfehlung:** Pruefen, ob der Wert entfernt oder als "internal-only" dokumentiert werden kann.

#### [B4-F8] Ranking partial_with_bonus Bonus disproportioniert
- **Datei:** `packages/quiz-engine/src/ranking.ts:32-42`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** BonusPoints = +1 ist bei niedrigen Punktezahlen ueberproportional (bei points=1 hat Bonus keinen Effekt wegen cap, bei points=2 fuegt er 50% hinzu).
- **Empfehlung:** Bonus proportional machen oder dokumentieren.

#### [B4-F9] connectSocket ohne defensive Pre-Existing-Socket-Bereinigung
- **Datei:** `packages/shared-hooks/src/useWebSocket.ts:66-90`
- **Kategorie:** runtime-risk
- **Schwere:** low
- **Beschreibung:** connectSocket schliesst keinen bestehenden Socket vor Erstellung eines neuen. In der aktuellen Nutzung sicher, aber nicht idempotent.
- **Empfehlung:** `socketRef.current?.close();` am Anfang von connectSocket ergaenzen.

#### [B4-F10] Discriminated-Union strict()-Requirement nicht dokumentiert
- **Datei:** `packages/shared-protocol/src/schemas.ts:176-181`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** strict() wird auf jedes Member einzeln angewendet, nicht auf Union-Level. Wenn ein kuenftiges Member .strict() vergisst, wuerden Extra-Felder durchgehen.
- **Empfehlung:** Kommentar oder Helper-Funktion ergaenzen.

---

### Bereich 5: Web-App Session-Hooks

#### [B5-F1] Display ERROR_PROTOCOL ohne Session-Cleanup — CRITICAL
(siehe Top 10 #1)

#### [B5-F2] Host behandelt QUESTION_CLOSE nicht
(siehe Top 10 #5)

#### [B5-F3] Host CONNECTION_RESUMED setzt Screen ohne Daten
(siehe Top 10 #6)

#### [B5-F4] Display CONNECTION_RESUMED setzt keinen Screen bei InGame
(siehe Top 10 #7)

#### [B5-F5] Player CONNECTION_RESUMED wertet gameState nicht aus
(siehe Top 10 #8)

#### [B5-F6] Host behandelt PLAYER_RECONNECTED nicht
- **Datei:** `apps/web-host/src/hooks/useHostSession.ts:207-453`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** Host zeigt bei PLAYER_DISCONNECTED einen Hinweis, loescht diesen aber nie wenn der Spieler reconnectet.
- **Empfehlung:** `case EVENTS.PLAYER_RECONNECTED:` ergaenzen und Disconnect-Hinweis loeschen.

#### [B5-F7] isCreatingRoomRef / isJoiningRef nach handleServerMessage deklariert
- **Datei:** `apps/web-display/src/hooks/useDisplaySession.ts:519`, `apps/web-player/src/hooks/usePlayerSession.ts:516`
- **Kategorie:** code-quality
- **Schwere:** medium
- **Beschreibung:** Refs werden nach der Funktion deklariert, die sie nutzt. Funktioniert zur Laufzeit wegen useEffectEvent, aber verwirrende Code-Organisation.
- **Empfehlung:** Refs vor handleServerMessage verschieben.

#### [B5-F8] Host GAME_STARTED setzt nicht setQuestion(null)
- **Datei:** `apps/web-host/src/hooks/useHostSession.ts:321-332`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** Bei Raum-Reset + Neustart bleibt die alte Frage kurz sichtbar. Display loescht korrekt.
- **Empfehlung:** `setQuestion(null)` in GAME_STARTED ergaenzen.

#### [B5-F9] Host ROOM_RESET bereinigt nicht alle UI-States
- **Datei:** `apps/web-host/src/hooks/useHostSession.ts:393-418`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** countdownSeconds, showAnswerTextOnPlayerDevices, confirmFinishNow, confirmRemovePlayerId werden nicht zurueckgesetzt. resetLobbyState wird nur bei ROOM_CLOSED und Fehler aufgerufen.
- **Empfehlung:** Fehlende Resets in ROOM_RESET ergaenzen.

#### [B5-F10] Display notice ist String statt strukturiertes Objekt
- **Datei:** `apps/web-display/src/hooks/useDisplaySession.ts:49`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Display nutzt `string | null`, Host/Player nutzen `{ kind, text }`. Display kann nicht zwischen Info und Fehler unterscheiden.
- **Empfehlung:** Auf denselben strukturierten Typ umstellen.

#### [B5-F11] intentionalReconnectRef ist toter Code
- **Datei:** `apps/web-host/src/hooks/useHostSession.ts:145,215`, `apps/web-player/src/hooks/usePlayerSession.ts:143,261`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Wird auf false gesetzt, aber nie gelesen und nie auf true gesetzt.
- **Empfehlung:** Entfernen.

#### [B5-F12] Inkonsistente QR-Code-Generierung
- **Datei:** Display vs Host
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Display generiert QR-Codes imperativ (useEffectEvent), Host deklarativ (useEffect mit Dependency).
- **Empfehlung:** Einheitlichen Ansatz waehlen.

#### [B5-F13] Host hat keinen Timeout fuer Aktionen
- **Datei:** `apps/web-host/src/hooks/useHostSession.ts`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** Player hat 10s Timeout fuer Antwort-Submissions. Host hat keinen analogen Timeout fuer handleCreateRoom etc. Bei fehlender Server-Antwort bleibt der Host haengen.
- **Empfehlung:** Timeout fuer kritische Host-Aktionen einfuehren.

#### [B5-F14] sendEvent gibt false zurueck wenn Socket nicht offen
- **Datei:** `packages/shared-hooks/src/useWebSocket.ts:43-53`
- **Kategorie:** runtime-risk
- **Schwere:** low
- **Beschreibung:** Events vor Verbindungsaufbau gehen verloren. Keine Message-Queue.
- **Empfehlung:** Keine Queue noetig fuer aktuellen Use-Case.

#### [B5-F15] LOBBY_UPDATE unterschiedlich aufwendig verarbeitet
- **Datei:** Alle drei Hooks
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Display: 1 Zeile. Host: 14 Zeilen mit Settings-Sync. Player: 4 Zeilen. Nicht geteilt.
- **Empfehlung:** Bei Gelegenheit geteilte Extraktionsfunktion ergaenzen.

#### [B5-F16] Host GAME_STARTED springt direkt auf "question"
- **Datei:** `apps/web-host/src/hooks/useHostSession.ts:331`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Natuerlicher Flow ist GAME_STARTED → QUESTION_COUNTDOWN → QUESTION_SHOW. Host springt direkt auf "question" und zeigt kurz leeren Screen.
- **Empfehlung:** Pruefen, ob Host bei GAME_STARTED auf "lobby" bleiben sollte.

---

### Bereich 6: UI-Komponenten

#### [B6-F1] ErrorBoundary identisch in allen drei Apps
- **Datei:** `apps/*/src/components/ErrorBoundary.tsx`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Alle drei ErrorBoundary-Komponenten sind identisch (63 Zeilen jeweils). 126 Zeilen Duplikation.
- **Empfehlung:** In shared-hooks oder eigenes shared-ui Package extrahieren.

#### [B6-F2] getConnectionLabel identisch in allen drei Apps
- **Datei:** `apps/*/src/App.tsx`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Dieselbe switch-Funktion fuer ConnectionState → Label-String in allen drei Apps. 3x 12 Zeilen Duplikation.
- **Empfehlung:** In shared-utils oder shared-hooks extrahieren.

#### [B6-F3] Host App.tsx hat 435 Zeilen (komplex)
- **Datei:** `apps/web-host/src/App.tsx`
- **Kategorie:** code-quality
- **Schwere:** medium
- **Beschreibung:** Die Host-App-Komponente hat 435 Zeilen mit vielen inline berechneten Variablen und komplexer conditional rendering logic. Schwer zu warten.
- **Empfehlung:** Berechnungen in useMemorized abstrahieren. Stage-Rendering in eigenen Sub-Components.

#### [B6-F4] PlayerQuestionScreen enthaelt 3 Komponenten in einer Datei
- **Datei:** `apps/web-player/src/components/PlayerQuestionScreen.tsx` (309 Zeilen)
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** PlayerQuestionScreen, PlayerRevealScreen und PlayerConfetti sind in einer Datei zusammengefasst.
- **Empfehlung:** Bei Gelegenheit in separate Dateien aufteilen.

#### [B6-F5] Kein Loading/Transition-State bei Screen-Wechsel
- **Datei:** Alle App.tsx
- **Kategorie:** runtime-risk
- **Schwere:** low
- **Beschreibung:** Screen-Wechsel passieren sofort ohne Fade/Transition zwischen States. Bei CONNECTION_RESUMED (siehe B5-F3-F5) kann es zu kurzen Flashs kommen.
- **Empfehlung:** CSS-Transitions fuer Screen-Wechsel ergaenzen (kosmetisch).

---

### Bereich 7: Styles & Config

#### [B7-F1] localStorage quota exceeded nicht behandelt
- **Datei:** `apps/*/src/storage.ts`
- **Kategorie:** runtime-risk
- **Schwere:** medium
- **Beschreibung:** saveXxxStoredSession() ruft localStorage.setItem() ohne try-catch auf. Bei vollem localStorage (z.B. in Private-Browsing-Modus) wirft setItem eine Exception, die uncaught die App zum Absturz bringt. loadXxxStoredSession hat korrekt try-catch.
- **Empfehlung:** try-catch um saveXxxStoredSession ergaenzen, mit console.warn bei Fehler.

#### [B7-F2] helpers.ts dupliziert URL-Konstruktionslogik
- **Datei:** `apps/web-display/src/lib/helpers.ts`, `apps/web-host/src/lib/helpers.ts`
- **Kategorie:** code-quality
- **Schwere:** medium
- **Beschreibung:** applyFallbackUiOrigin / applyFallbackPlayerOrigin aehneln sich stark. Beide loesen Player-URLs aus Env-Variablen auf. Die Fallback-Chain-Logik ist dupliziert.
- **Empfehlung:** In shared-utils extrahieren.

#### [B7-F3] Vite-Configs identisch bis auf Port und allowedHost
- **Datei:** `apps/*/vite.config.ts`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Alle drei Vite-Configs sind bis auf Port und allowedHost identisch (21 Zeilen jeweils). Proxy-Konfiguration ist dupliziert.
- **Empfehlung:** Gemeinsame Config in shared vite config extrahieren.

#### [B7-F4] CSS-Gesamtgroesse ~7.100 Zeilen
- **Datei:** `apps/*/src/styles.css`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** Display: 3.356, Host: 2.074, Player: 1.701 Zeilen. Kein Shared-CSS, keine CSS-Variablen geteilt. Bei Aenderungen an Design-Tokens muessen drei Dateien geaendert werden.
- **Empfehlung:** Gemeinsame CSS-Variablen/Tokens in shared Package extrahieren.

#### [B7-F5] labels.ts dupliziert Question-Type-Labels
- **Datei:** `apps/web-display/src/lib/labels.ts`, `apps/web-host/src/lib/labels.ts`
- **Kategorie:** code-quality
- **Schwere:** low
- **Beschreibung:** questionTypeLabel() ist in Display und Host identisch definiert. Player hat es nicht (nutzt es nicht).
- **Empfehlung:** In shared-utils extrahieren.

---

## Positive Beobachtungen

- **Server ist stringent authoritative**: Alle State-Transition-Guards sind vorhanden. Rollen-Auth ist konsistent. Answer-Validation ist strikt.
- **Kein Leaking korrekter Antworten**: toQuestionControllerPayload enthaelt weder correctOptionId, correctValue, correctOrder noch correctText. Verifiziert.
- **Disconnect-Grace-Logik ist vollstaendig**: Display (45s), Host (5min), Player (30s). Reconnect bricht Timer korrekt ab. Cleanup ist in closeRoom konsolidiert.
- **Timer-Bereinigung ist zentralisiert**: clearActiveRoomTimers bereinigt alle 5 Timer-Typen. Wird bei closeRoom, restart und finish aufgerufen.
- **Sync-Logik ist umfassend**: syncSessionToRoomState repliziert den kompletten Spielzustand fuer alle GameState-Varianten (Idle, QuestionActive, AnswerLocked, Revealing, Scoreboard, Completed).
- **Zod-Schemas sind konsistent .strict()**: Kein z.any(), keine unvalidierten z.record(). NaN/Infinity werden von NumberAnswerSchema abgelehnt.
- **quiz-engine ist deterministisch**: Alle Evaluatoren sind pure Functions. Gleicher Input = gleicher Output. Edge-Cases (leere Arrays, Ties) werden behandelt.
- **Test-Abdeckung ist gut**: 251 Tests, 19 Test-Dateien. Alle quiz-engine-Module haben Tests. Server-Integrationstests decken Reconnect, Restart und Error-Paths ab.

---

## Empfohlene Reihenfolge fuer Fixes

### Sofort (vor dem Quiz-Abend)
1. **[B5-F1]** Display ERROR_PROTOCOL Session-Cleanup — verhindert Deadlock nach Serverneustart
2. **[B5-F2]** Host QUESTION_CLOSE Handler — verhindert verwirrenden Countdown-Stand
3. **[B5-F3/F4/F5]** CONNECTION_RESUMED Screen-Setting in allen drei Hooks — verhindert leere/falsche Screens nach Reconnect
4. **[B7-F1]** localStorage saveXxxStoredSession try-catch — verhindert App-Absturz bei vollem Storage

### Kurzfristig (nach dem Abend, vor naechstem Sprint)
5. **[B1-F2]** Exhaustiveness-Check in evaluateQuestion
6. **[B3-F1]** loadDefaultQuiz try-catch
7. **[B2-F3]** socket.on('error') Bereinigung
8. **[B1-F6]** revealTimer null-Setzung im Callback
9. **[B1-F4]** timerTickInterval State-Guard
10. **[B5-F6]** Host PLAYER_RECONNECTED Handler

### Mittelfristig (technische Schulden)
11. Exhaustiveness-Checks in allen Switches (B3-F3, B3-F4, B2-F1)
12. [B4-F1] useWebSocket shouldReconnectRef Reset
13. [B5-F9] Host ROOM_RESET vollstaendiger State-Reset
14. [B5-F13] Host Action-Timeouts
15. [B3-F5] Geteilte Raenge im Scoreboard

### Langfristig (Code-Qualitaet)
16. Duplikation reduzieren: ErrorBoundary, getConnectionLabel, labels, helpers, Vite-Config
17. [B6-F3] Host App.tsx Refactoring
18. [B7-F4] Shared CSS-Tokens
19. [B4-F3] Estimate-Schema Spread-Pattern
20. Dead Code entfernen: intentionalReconnectRef, B1-F14
