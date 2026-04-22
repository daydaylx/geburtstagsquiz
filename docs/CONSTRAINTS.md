# Grenzen & Kritische Probleme

## Kritische Problemstellen

### 1. Reconnect / Verbindungsverlust

**Problem:**
Spieler verlieren WLAN, sperren das Handy, wechseln Tabs oder schließen Browser.

**Anforderung:**

- Session-ID pro Spieler
- Wiederverbinden in laufenden Raum möglich
- klare Statuswerte: `verbunden`, `getrennt`, `wieder verbunden`
- Server behält Player **30 Sekunden** im Raum mit State `disconnected` — Punkte und bereits gesendete Antworten bleiben erhalten
- nach 30 Sekunden ohne Reconnect: Spieler wird aus der Room-Datenstruktur entfernt (State `disconnected` → Spieler gelöscht)
- alle alten Antworten werden bei erfolgreichen Reconnect wiederhergestellt

**Warum kritisch:**
Reconnect ist das erste, was schiefgeht bei echten Spielern (schlechtes WLAN, Ablenkung, Mishaps).
Wenn Reconnect nicht gut funktioniert, ist die UX unbrauchbar.

**Lösung:**

- in Phase 2 direkt einbauen, nicht "später"
- saubere State-Verwaltung im Server
- Heartbeat / Timeout-Detection
- automatischer Client-seitiger Reconnect mit Backoff

---

### 2. Doppelte Antworten

**Problem:**
Spieler drückt "Antwort senden" zweimal.
Oder: Netzwerk-Retry sendet Anfrage zweimal.

**Anforderung:**
Pro Spieler pro Frage: nur **eine gültige Antwort**.
Später eingehende Antworten werden ignoriert.

**Warum kritisch:**
Duplikate führen zu falschen Punkten und Manipulierbarkeit.

**Lösung:**

- Client: Button disabelt nach erstem Click
- Server: Prüfe bei Annahme: hat dieser Spieler schon beantwortet?
- Server: Antworte mit "Antwort bereits gesendet", nicht mit Fehler

---

### 3. Buzzer-Fairness

**Problem:**
Bei Buzzer-Modus: wer ist zuerst? Das kann nicht der Client entscheiden.

**Anforderung:**
Nur der Server darf entscheiden:

- ab wann Buzzer offen ist
- wer zuerst war (basiert auf Timestamp des Server-Events)
- wann Buzzer geschlossen wird

**Warum kritisch:**
Client-seitig entscheiden = Cheating ist trivial (manipuliere Lokalzeit oder Event-Timing).

**Lösung:**

- Server definiert Buzzer-Fenster streng
- alle Buzzer-Events haben Timestamp vom Server
- Server sortiert nach Timestamp
- Client kriegt nur Bescheid "du bist #2" oder "du bist #1, antworte jetzt"

---

### 4. Host-Abbruch

**Problem:**
Host-Seite wird geschlossen während Spiel läuft.

**Anforderung:**

- Raum **nicht sofort löschen**
- Status behalten (welche Frage, welche Antworten)
- Player sehen "Host hat Spiel unterbrochen"
- Player können optional zurück in Lobby

**Warum kritisch:**
Wenn Raum weg ist, sind auch alle Player-Sessions futsch und Spieler verlieren den Raum.

**Lösung:**

- Host-Disconnect triggert `game:paused` an alle Player
- Raum wird 5 Minuten später gelöscht
- Player können in dieser Zeit zurückkommen

---

### 5. Mobile Browser-Eigenheiten

**Problem:**

- Bildschirm schläft ein während Spiel
- Browser throttlet Background-Tabs
- schlechte Netzqualität unterwegs
- verschiedene Displaygrößen (klein bis groß)
- Unterschiedliche Browser-Capabilities

**Anforderung:**

- UI simpel halten
- Wenig komplexe Animationen
- große Touch-Targets (44×44px mind.)
- kein Scrollen nötig
- keine Abhängigkeit von Browser-APIs die nicht überall da sind

**Warum kritisch:**
Mobilfreundlichkeit ist nicht optional – es ist ein Handy-Spiel.

**Lösung:**

- kein Overengineering beim Styling
- regelmäßig auf echten mobilen Geräten testen
- einfache CSS, keine komplexen Frameworks
- responsive Design von Anfang an

---

### 6. Timer-Manipulation

**Problem:**
Spieler manipuliert lokale Zeit oder Client-seitigen Timer.

**Anforderung:**
Server kontrolliert Timer streng.
Client zeigt nur an, was Server sendet.

**Warum kritisch:**
Wenn Client Timer kontrolliert, kann Spieler extra Zeit quetschen.

**Lösung:**

- Server berechnet verbleibende Zeit
- Server sendet regelmäßig (z.B. jede 500ms) Timer-Update
- Client zeigt nur Server-Zeit an
- Client respektiert Server-Entscheidung "Zeit vorbei"

---

### 7. Netzwerk-Latenz

**Problem:**
Spieler sendet Antwort mit 500ms Verzögerung an (schlechtes Netz).
Server Timer ist bereits abgelaufen.

**Anforderung:**

- Server hat Toleranz-Fenster (z.B. 100ms Puffer)
- oder: Server sperrt Eingaben strikt nach Timer endet
- keine Rückdatierungen von Antworten

**Warum kritisch:**
Zu streng = echte Spieler verlieren Antworten.
Zu locker = unfaire Situation.

**Lösung:**

- Server nimmt Antworten bis Timer + 200ms an
- danach: stricte Ablehnung
- sauber in Event-Payloads dokumentieren

---

## Bewusstes Weglassen (MVP)

Diese Features **nicht** im MVP:

| Feature                     | Grund                                  | Zeitersparnis |
| --------------------------- | -------------------------------------- | ------------- |
| **Benutzerkonten**          | MVP ist anonym, später prüfbar         | 3–5 Tage      |
| **Cloud-Profile**           | Keine Persistierung im MVP             | 2–3 Tage      |
| **Chat**                    | Lenkt ab, Security-Aufwand             | 2 Tage        |
| **Freundeslisten**          | Social-Features sind Overhead          | 1–2 Tage      |
| **Avatare**                 | Nett, aber nicht nötig                 | 1 Tag         |
| **Achievements / Badges**   | Gamification-Overhead                  | 2–3 Tage      |
| **Live-KI-Fragengenerator** | Zu komplex + API-Kosten                | 5+ Tage       |
| **Sprachchat / Video**      | Browser-APIs komplex + Latenz-Probleme | 10+ Tage      |
| **Soundeffekte**            | Nett, aber Overhead für Browser        | 1–2 Tage      |
| **3D-Effekte**              | Attention-Grabbing aber fragile        | 2–3 Tage      |
| **Dunkelmodus**             | Nice-to-have, später trivial           | 1 Tag         |
| **Mehrsprachigkeit**        | Overhead, später einfach zu add        | 2–3 Tage      |
| **Quiz-Editor in UI**       | Komplexe UI, später einfacher zu bauen | 3–4 Tage      |
| **Teams/Paare**             | Verschiedene Logik, später addierbar   | 2–3 Tage      |
| **Joker/Lifelines**         | Extra Komplexität, später gut          | 2–3 Tage      |

**Gesamt eingesparte Zeit:** ~40–60 Tage Arbeit durch klaren Scope.

Das ist der Unterschied zwischen "shipping in 2 Wochen" und "shipping in 3 Monaten".

---

## Was richtig gemacht werden muss

### 1. Server ist authoritative

Das wichtigste von allen.

**Falsch:**

```javascript
// Client berechnet Punkte
const points = answer === correctAnswer ? 10 : 0;
socket.emit("answer:submit", { answer, points });
```

**Richtig:**

```javascript
// Client sendet nur Antwort
socket.emit("answer:submit", { answer });
// Server entscheidet Korrektheit + Punkte
server.validateAndScore(playerId, answer);
```

### 2. Geteilte Typen

**Falsch:**

```typescript
// Host hat eigene Definition
interface Player {
  id: string;
  name: string;
  score: number;
}

// Player hat andere Definition
type PlayerData = {
  playerId: string;
  playerName: string;
  points: number;
};
```

**Richtig:**

```typescript
// Alle nutzen shared-types
import { Player } from "@shared/types";
```

### 3. Validierung überall

**Falsch:**

```typescript
server.on("answer:submit", (data) => {
  // keine Validierung, vertrau dem Client
  processAnswer(data.playerId, data.answer);
});
```

**Richtig:**

```typescript
server.on("answer:submit", (data) => {
  // Validiere zuerst
  const result = AnswerSchema.safeParse(data);
  if (!result.success) {
    return socket.emit("error", "Invalid payload");
  }

  // Dann Business-Logik
  processAnswer(result.data.playerId, result.data.answer);
});
```

### 4. Events sind dokumentiert

**Falsch:**

```typescript
// Events sind magische Strings überall
socket.on('game:start', ...)
socket.emit('question:shown', ...)
socket.on('player:answered', ...)
// Niemand weiß, wie Payloads aussehen
```

**Richtig:**

```typescript
// shared-protocol/events.ts
export const EVENTS = {
  GAME_START: "game:start",
  QUESTION_SHOW: "question:show",
  ANSWER_SUBMIT: "answer:submit",
} as const;

export const GameStartPayload = z.object({
  quizId: z.string(),
  startedAt: z.number(),
});

export const AnswerSubmitPayload = z.object({
  playerId: z.string(),
  questionId: z.string(),
  answerValue: z.union([z.string(), z.number()]),
  submittedAt: z.number(),
});
```

### 5. Fehlerbehandlung ist sauber

**Falsch:**

```typescript
// Fehler werden verschluckt
try {
  processAnswer(data);
} catch (e) {
  console.error(e);
  // User weiß nichts
}
```

**Richtig:**

```typescript
try {
  processAnswer(data);
} catch (e) {
  if (e instanceof ValidationError) {
    socket.emit("error", { code: "INVALID_ANSWER", message: "Ungültige Antwort" });
  } else if (e instanceof GameStateError) {
    socket.emit("error", { code: "GAME_NOT_ACTIVE", message: "Spiel ist nicht aktiv" });
  } else {
    logger.error("Unexpected error:", e);
    socket.emit("error", { code: "SERVER_ERROR", message: "Server-Fehler" });
  }
}
```

---

## Performance-Erwartungen

### MVP

- **Lobby:** <100ms Latenz für Live-Updates
- **Spielablauf:** <200ms für Antwort-Verarbeitung
- **Skalierung:** stabil bis ~50 Spieler in einem Raum
- **Speichernutzung:** <100MB für Server

### Nicht nötig im MVP

- CDN / Caching
- Datenbank-Optimierung
- Server-Cluster
- Load-Balancing
- Caching-Strategien

Alles später trivial zu add wenn wirklich nötig.

---

## Sicherheit im MVP

### Was zu beachten ist

- ❌ **Keine unvalidierten Inputs** – alle Events validieren
- ❌ **keine hardcodierten Secrets** – .env Files
- ❌ **keine CORS-Blindheit** – nur erlaubte Origins
- ❌ **keine Raumcode-Vorhersagbarkeit** – 6-stellig random, nicht sequenziell

### Was nicht nötig ist (MVP)

- ✅ SSL/TLS (lokal ok, production später)
- ✅ authentifiziert Benutzer (anonym ok)
- ✅ Encryption der Daten in Ruhe (nicht nötig)
- ✅ Rate-Limiting (später)
- ✅ GDPR-Compliance (keine Persistierung = keine Compliance-Sorgen)

---

## Testing-Strategie

### Im MVP konzentrieren auf

1. **Server-Logic-Tests** (quiz-engine)
   - Punkteberechnung korrekt?
   - Buzzer-Reihenfolge gerecht?
   - Validierung funktioniert?

2. **Integrations-Tests** (Server + Client-Simulation)
   - kompletter Spielablauf funktioniert?
   - Reconnect-Szenarios ok?
   - Edge Cases nicht kritisch?

3. **Manual Testing** (echte Geräte)
   - UI auf verschiedenen Handys ok?
   - Netzwerk-Jitter tolleriert?
   - Timing ok?

### Nicht nötig (MVP)

- ❌ Full E2E automatisiert (später)
- ❌ Browser-Compatibility auf 20 Browsern (Chrome, Firefox, Safari reichen)
- ❌ Load-Tests (später, wenn >100 Spieler relevant)
- ❌ Stress-Tests

---

## Deployment MVP

### Lokal

- `npm run dev` started Server + Host + Player
- Test im Browser + echte Handys im LAN

### Production MVP

- einfacher Node-Server auf Linux
- einzelne Instanz (keine Cluster)
- In-Memory-State (Raum-Daten weg bei Neustart)
- einfaches Logging (stdout + logfile)
- kein Failover-Setup

### Später denkbar

- Docker-Container
- Redis für Session-Persistierung
- Postgres für Quiz-Verlauf
- Monitoring (Prometheus, Grafana)
- Load-Balancer für mehrere Server-Instanzen
