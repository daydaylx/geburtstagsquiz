# Technisches Komplett-Audit

**Datum:** 2026-04-28  
**Repo:** geburtstagsquiz  
**Branch:** main  
**Auditor:** Claude Code (Sonnet 4.6)

---

## Kurzfazit

Das Projekt ist technisch solide und bereit für einen ersten lokalen E2E-Test. TypeScript-Typecheck und alle 126 Unit-Tests sind grün. Rollenrechte (Host/Display/Player) sind durchgängig serverseitig durchgesetzt, Broadcasts sind korrekt segregiert, und Session-Reconnect funktioniert für alle drei Rollen. Es gibt keine kritischen Blocker. Die wichtigsten offenen Punkte sind: ein konfuser doppelter Duration-Wert (15 s vs. 30 s), fehlende Tests für den Host-Reconnect-Flow und die Tatsache, dass die JSON-Dateien erst beim Server-Start geladen werden und dabei keine Test-Abdeckung haben. Das Deployment (Cloudflare Tunnel, .env.production) ist vorbereitet aber noch nicht vollständig abgeschlossen.

---

## Ampelbewertung

| Bereich                     | Status    | Begründung                                                                                                                                                                                                   |
| --------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Architektur**             | 🟢 green  | Display-first-Flow klar implementiert. Beide Flows (legacy room:create + display:create-room) koexistieren und sind dokumentiert. Keine kreisförmigen Abhängigkeiten.                                        |
| **Serverrollen & Sessions** | 🟢 green  | Drei Rollen strikt getrennt. isEventAllowedForRole() auf Socket-Ebene als erste Schranke. Handler prüfen role + roomId zusätzlich. One-time hostToken. Grace-Periods: Display 45 s, Host 5 min, Player 30 s. |
| **Broadcast/Eventfluss**    | 🟢 green  | question:show → Host+Display; question:controller → Player; answer:progress → Host+Display; question:reveal → alle (mit explanation); score:update → alle; game:finished → alle. Korrekt.                    |
| **Display-App**             | 🟡 yellow | Implementierung vorhanden. Speichert hostToken im Browser-State (für QR-Code). Reconnect via displaySessionId funktioniert. Kein direkter UI-Test durchgeführt.                                              |
| **Host-App**                | 🟢 green  | Sendet nur HOST_CONNECT, GAME_START, GAME_NEXT_QUESTION, ROOM_SETTINGS_UPDATE, ROOM_CLOSE. Keine Display/Player-Events. Korrekte Rollentrennung.                                                             |
| **Player-App**              | 🟢 green  | Sendet kein GAME_START, HOST_CONNECT, DISPLAY_CREATE_ROOM. Erhält question:controller (nicht question:show). Korrekte Rollentrennung.                                                                        |
| **Tests**                   | 🟡 yellow | 126/126 Tests grün, 11 Testdateien. Kritische Pfade (Broadcast, Rollen, Reconnect) gut abgedeckt. Fehlend: Host-Reconnect Mid-Game, room:create Legacy-Flow, JSON-Ladebarkeitstests.                         |
| **Lokale Testbarkeit**      | 🟡 yellow | Technisch möglich (alle Dev-Server parallel startbar). Shell-Scripts vorhanden. Kein dokumentierter Ein-Befehl-Start für alle 4 Dienste; manuelle Koordination nötig.                                        |
| **Domain/Env-Vorbereitung** | 🟡 yellow | Cloudflare Tunnel-Binaries vorhanden. .env.tunnel.example untracked. VITE_SERVER_SOCKET_URL und andere Produktions-URLs noch nicht in .env.production gesetzt.                                               |

---

## Kritische Blocker

_Keine._

---

## Hohe Risiken

- [ ] **H1 – doppelter Duration-Wert:** `quiz-data.ts:54` setzt `DEFAULT_QUESTION_DURATION_MS = 15_000`, aber `game.ts:132-134` überschreibt das sofort mit `QUESTION_DURATION_MS = 30_000` (aus config.ts). Ergebnis: 30 Sekunden pro Frage. Wer die Fragedauer ändern will, muss wissen, dass nur config.ts zählt – nicht quiz-data.ts. Führt zu Fehlannahmen bei zukünftiger Wartung.

- [ ] **H2 – JSON-Ladezeit beim Server-Start:** `quiz-data.ts:349` lädt beide JSON-Dateien synchron beim Modul-Import (`const DEFAULT_QUIZ = loadDefaultQuiz()`). Schlägt die Datei-Suche fehl oder enthält eine Frage eine unbekannte Struktur, crasht der Server beim Start – ohne Fehler-Logging vorab. Kein Test lädt die echten JSON-Dateien. Erst ein manueller Server-Start verifiziert diesen Pfad vollständig.

---

## Hohe Risiken (Sicherheit / MVP-Kontext)

- [ ] **H3 – hostToken im Display-Browser gespeichert:** `room.ts:327-333` gibt `hostToken` in `DISPLAY_ROOM_CREATED` zurück. Der Display-Client speichert ihn im State und bettet ihn in den QR-Code-URL ein. Wer Zugriff auf den Display-Browser hat (DevTools, localStorage) oder den QR-Code-Link direkt liest, kann den hostToken extrahieren und als Host auftreten. Für einen Abendabend mit Vertrauenspersonen akzeptabel, sollte aber dokumentiert sein.

---

## Mittlere Risiken

- [ ] **M1 – QUESTION_CLOSE mit falschem gameState bei Reconnect:** `connection.ts:260` und `connection.ts:285`: In den Zuständen `GameState.Revealing` und `GameState.Scoreboard` sendet `syncSessionToRoomState()` das Event `QUESTION_CLOSE` mit hartcodiertem `gameState: GameState.AnswerLocked`, obwohl der echte Zustand `Revealing` / `Scoreboard` ist. Wiederverbindende Clients sehen kurz `AnswerLocked`, bevor das nachfolgende `QUESTION_REVEAL` ankommt. Kein Datenverlust, aber potenziell flackernde UI.

- [ ] **M2 – Beide Raum-Erstellungsflows aktiv:** `index.ts:171-180` registriert sowohl `ROOM_CREATE` (legacy host-first, ohne displayToken) als auch `DISPLAY_CREATE_ROOM` (display-first). Geräte, die den alten Flow nutzen, bekommen Räume ohne Display-Pairing und ohne hostToken in der globalen Map. Für das MVP bewusst so – sollte dokumentiert und der Legacy-Path mittelfristig abgestellt werden.

- [ ] **M3 – Session-Übernahme per sessionId:** `lobby.ts:340-351` authentifiziert Reconnects nur über `sessionId` + `roomId`. Kein zusätzliches Secret. Wer an eine fremde sessionId gelangt (DevTools, Netzwerk-Sniffing im WLAN), kann die Session übernehmen. Für MVP/Abendabend akzeptabel; kein Bearer-Token-Mechanismus vorhanden.

- [ ] **M4 – 44 Fragen-IDs in beiden JSON-Dateien:** v4 und v5 teilen 44 Question-IDs. `loadDefaultQuiz()` überschreibt v4-Versionen mit v5-Versionen (Map-Semantik, v5 wird zuletzt geladen). Bei inhaltlichen Fehlern in v5 gibt es keinen automatischen Fallback auf v4.

---

## Kleine Probleme

- [ ] **K1 – Totes Constant `DEFAULT_QUESTION_DURATION_MS`:** `quiz-data.ts:54` definiert 15 s, der Wert wird in `getEveningQuestions()` nie verwendet. Führt zu falschen Erwartungen.
- [ ] **K2 – Kein Player-Cap:** Kein Maximum an Spielern pro Raum. Bei vielen simultanen Teilnehmern können Performance-Probleme auftreten. Für MVP-Abendabend (<20 Spieler) unkritisch.
- [ ] **K3 – Leere Strings als Default-IDs:** `room.ts:281-282` setzt `hostName: ""`, `hostSessionId: ""` für Display-Rooms vor Host-Pairing. `sessionsById.get("")` liefert `undefined`, was überall korrekt gehandhabt wird. Dennoch: leer vs. null ist semantisch unklar.
- [ ] **K4 – Nicht-enum-konforme Fragetypen in v5:** v5-JSON enthält Typen wie `standard`, `common_mistake`, `pattern`, `estimate_duel`, `fast_guess`, `sudden_death_estimate`. `transformQuestion()` verarbeitet diese per Heuristik (`hasCorrectOption` → MultipleChoice, etc.), aber ein Fehler beim Parsen crasht den Server-Start.
- [ ] **K5 – `player:disconnected` nicht explizit an Display:** `session.ts:119-120` sendet `PLAYER_DISCONNECTED` nur an Host und Players. Display bekommt es nur indirekt via `lobby:update`. Kein Bug (display:update folgt direkt danach), aber leichte Inkonsistenz zu `player:reconnected` (gleiche Routing-Entscheidung).
- [ ] **K6 – Kein Rate-Limiting auf WebSocket:** Keine Begrenzung auf Join-Versuche oder Messages pro Sekunde. DoS durch Message-Flooding theoretisch möglich. Für isolierten Abend-WLAN irrelevant.

---

## Betroffene Dateien & Code-Stellen

```
apps/server/src/quiz-data.ts:54      → DEFAULT_QUESTION_DURATION_MS = 15_000 (immer überschrieben)
apps/server/src/game.ts:132-134      → durationMs: QUESTION_DURATION_MS  (echte 30s-Quelle)
apps/server/src/connection.ts:260    → QUESTION_CLOSE mit gameState: AnswerLocked im Revealing-Zustand
apps/server/src/connection.ts:285    → QUESTION_CLOSE mit gameState: AnswerLocked im Scoreboard-Zustand
apps/server/src/room.ts:281-282      → hostName: "", hostSessionId: "" für Display-Rooms
apps/server/src/room.ts:327-333      → DISPLAY_ROOM_CREATED gibt hostToken an Display zurück
apps/server/src/quiz-data.ts:349     → DEFAULT_QUIZ = loadDefaultQuiz() beim Modul-Import (kein Error-Handling)
apps/server/src/index.ts:179-180     → ROOM_CREATE Legacy-Handler aktiv neben DISPLAY_CREATE_ROOM
apps/server/src/lobby.ts:340-343     → handleConnectionResume: kein Secret außer sessionId+roomId
apps/server/src/session.ts:119-120   → PLAYER_DISCONNECTED nur an Host+Players, nicht Display
```

_(Zeilennummern verifiziert via `grep -n` und direktem Dateilesen.)_

---

## Fehlende Tests (konkret)

| Datei                                             | describe / it                                                                           | Ziel                                                                    |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `apps/server/src/display-host-roles.test.ts`      | `it("player cannot send game:start")`                                                   | Verifizieren, dass isEventAllowedForRole Player von GAME_START blockt   |
| `apps/server/src/display-host-roles.test.ts`      | `it("display cannot send game:start")`                                                  | Verifizieren, dass isEventAllowedForRole Display von GAME_START blockt  |
| `apps/server/src/game.test.ts`                    | `it("rejects answer submission after question:close")`                                  | Verifizieren, dass keine Antwort nach Timeout angenommen wird           |
| `apps/server/src/session.test.ts` (neu anlegen)   | `describe("host reconnect")` → `it("clears disconnect timer on reconnect")`             | Host verbindet sich innerhalb von 5 min wieder, Raum bleibt offen       |
| `apps/server/src/session.test.ts` (neu anlegen)   | `describe("host timeout")` → `it("closes room after 5min no-reconnect")`                | Host bleibt weg, Raum wird nach Timeout geschlossen                     |
| `apps/server/src/lobby.test.ts` (neu anlegen)     | `describe("createRoom legacy")` → `it("creates host-first room without displayToken")`  | room:create Flow; displayToken ist leer, kein roomIdByHostToken-Eintrag |
| `apps/server/src/quiz-data.test.ts` (neu anlegen) | `describe("loadDefaultQuiz integration")` → `it("loads both JSON files without error")` | Integrations-Test: echte JSON-Dateien laden, Frageanzahl prüfen         |
| `apps/server/src/quiz-data.test.ts` (neu anlegen) | `it("no duplicate question IDs across both source files")`                              | Kombinierter Pool aus v4+v5, Duplikat-Check                             |

---

## Minimaler Fix-Plan

1. **quiz-data.ts:54 – Constant löschen:** `DEFAULT_QUESTION_DURATION_MS` entfernen; `durationMs` bei `toOptionQuestion()` etc. auf `0` oder weglassen (da es in `getEveningQuestions` ohnehin überschrieben wird). Oder: Constant durch `QUESTION_DURATION_MS` aus config.ts ersetzen und in quiz-data.ts importieren.

2. **connection.ts:260, 285 – QUESTION_CLOSE gameState korrigieren:** `gameState: GameState.AnswerLocked` durch die jeweilig korrekte `room.gameState` ersetzen. Damit sehen wiederverbindende Clients den echten Zustand.

3. **Session-Tests ergänzen:** `apps/server/src/session.test.ts` neu anlegen mit Host-Reconnect- und Timeout-Tests (siehe Tabelle oben). Sicherstellt, dass der 5-Minuten-Grace-Period-Mechanismus verifiziert ist.

4. **JSON-Ladetest ergänzen:** `apps/server/src/quiz-data.test.ts` mit einem Integrationstest, der `loadDefaultQuiz()` auf den echten Dateien aufruft. Damit wird Server-Crash bei Start frühzeitig erkannt.

5. **hostToken-Exposition dokumentieren:** In `docs/CONSTRAINTS.md` einen Abschnitt ergänzen: "Der hostToken wird zum Display-Client übertragen und im QR-Code-URL eingebettet. Für vertrauenswürdige Gruppen akzeptiert."

6. **Deployment-Checkliste fertigstellen:** `.env.production` mit finalen Werten für `VITE_SERVER_SOCKET_URL`, `VITE_DISPLAY_URL`, `VITE_HOST_URL`, `VITE_PLAYER_JOIN_BASE_URL` befüllen und `.env.tunnel.example` committieren.

---

## Lokaler E2E-Test: Sinnvoll jetzt?

**Ja** – mit manueller Vorbereitung.

**Voraussetzungen:**

- Node ≥20, corepack/pnpm verfügbar
- Beide JSON-Dateien im Repo-Root vorhanden ✓
- Vier Dev-Server starten: `corepack pnpm -r --parallel run dev` (oder `./start_quiz.sh` wenn verifiziert)
- Ports: Server 3001, web-display 5175, web-host 5173, web-player 5174

**Empfohlener E2E-Flow (manuell):**

1. `web-display` (Laptop-Browser) öffnen → Raum erstellen → QR-Codes erscheinen
2. `web-host` (QR-Code scannen oder ?hostToken=… manuell) → pairt mit Display
3. `web-player` (2× Smartphone oder Inkognito-Tab, ?joinCode=…) → beitreten
4. Host startet Spiel → Frage erscheint auf Display + Host; Player sehen Controller
5. Alle beantworten → Reveal mit Explanation → Scoreboard → Ready → nächste Frage
6. Browser-Tab von Display schließen und wieder öffnen → Reconnect testen (displayToken in localStorage)
7. Browser-Tab von Host schließen und wieder öffnen → Reconnect testen (hostSessionId in localStorage)
8. Player-Tab schließen und wieder öffnen → Reconnect testen (sessionId in localStorage)

**Bekanntes Risiko beim ersten Start:** Server-Start kann crashen wenn JSON-Dateien nicht gefunden werden (M2/H2). Sicherstellen, dass `cwd` beim Serverstart das Repo-Root ist.

---

## Was vor Cloudflare/Domain zwingend erledigt sein muss

- [ ] Lokaler E2E-Test vollständig durchlaufen (alle drei Rollen, Reconnect getestet)
- [ ] `VITE_SERVER_SOCKET_URL` und andere VITE\_-Variablen in `.env.production` gesetzt (wss://server.disaai.de oder ähnlich)
- [ ] `.env.tunnel.example` committieren und in Deployment-Doku referenzieren
- [ ] Cloudflare Tunnel für alle 4 Endpunkte (server, display, host, player) konfiguriert und getestet
- [ ] Fix für QUESTION_CLOSE gameState-Bug (M1) sollte vor erstem echten Spielabend erledigt sein, da Reconnect-UX sonst flackert
- [ ] Mindestens einen manuellen Lauf mit >2 Spielern abgeschlossen haben

---

## Build/Typecheck/Test-Status & Artefakte

| Check                                     | Ergebnis                                            |
| ----------------------------------------- | --------------------------------------------------- |
| `corepack pnpm -r run typecheck`          | **PASSED** – alle 8 Packages fehlerfrei             |
| `corepack pnpm test` (vitest run)         | **PASSED** – 126/126 Tests, 11 Testdateien, 4.96 s  |
| `corepack pnpm -r run build`              | Nicht ausgeführt (typecheck grün, kein Blocker)     |
| Unerwartete Änderungen außerhalb `audit/` | **Keine** (git status nach Audit: nur `audit/` neu) |

**Test-Verteilung:**
| Datei | Tests |
|---|---|
| `packages/shared-protocol/src/schemas.test.ts` | 37 |
| `apps/server/src/display-host-roles.test.ts` | 35 |
| `packages/quiz-engine/src/multiple-choice.test.ts` | 8 |
| `apps/server/src/display-broadcast.test.ts` | 9 |
| `apps/server/src/game.test.ts` | 10 |
| `packages/quiz-engine/src/scoreboard.test.ts` | 6 |
| `apps/server/src/answer-validation.test.ts` | 7 |
| `packages/quiz-engine/src/estimate.test.ts` | 4 |
| `packages/quiz-engine/src/ranking.test.ts` | 5 |
| `packages/quiz-engine/src/majority-guess.test.ts` | 3 |
| `packages/quiz-engine/src/open-text.test.ts` | 2 |

---

## Fragenkatalog-Stichprobe (5 Typen, verifiziert)

| Typ               | Beispiel-ID          | Hat Explanation | Schema-OK                                                        |
| ----------------- | -------------------- | --------------- | ---------------------------------------------------------------- |
| `multiple_choice` | `q-02-01-c95a802a2d` | ✓               | ✓ (id, prompt, options, correct_option_id, explanation)          |
| `estimate`        | `q-01-05`            | ✓               | ✓ (id, prompt, answer.reference_value, answer.unit, explanation) |
| `ranking`         | `q-01-04`            | ✓               | ✓ (id, prompt, items, correct_order, explanation)                |
| `majority_guess`  | `q-01-08`            | ✓               | ✓ (id, prompt, options, explanation)                             |
| `open_text`       | —                    | —               | **Nicht in v5-JSON** (keine canonical-Fragen gefunden)           |

**Weitere v5-Typen (nicht-enum):** `standard`(47), `logic`(30), `common_mistake`(20), `pattern`(12), `estimate_duel`(9), `fast_guess`(13), `sudden_death_estimate`(9). Werden alle per Heuristik transformiert.  
**Gesamtpool:** 520 eindeutige Fragen (v4: 282 + v5: 282 − 44 Overlap). Keine Duplikat-IDs innerhalb einer Datei.  
**`open_text` im QuestionType-Enum vorhanden** (shared-types, quiz-engine), aber kein Inhalt in den aktuellen JSON-Dateien. `OpenText`-Engine-Code ist toter Code für den aktuellen Datensatz.

---

_Dieses Dokument ist READ-ONLY. Keine Code-Änderungen wurden vorgenommen._
