# quiz-engine

## Zweck

`packages/quiz-engine` ist die einzige Stelle, an der Spiellogik berechnet wird.

Das Paket ist:

- **reine Funktion** – kein I/O, kein State, keine WebSocket-Aufrufe
- **framework-unabhängig** – kein React, kein Node-spezifisches
- **serverseitig genutzt** – nur `apps/server` importiert quiz-engine

Der Server ruft quiz-engine auf, verarbeitet das Ergebnis, und verteilt es dann per WebSocket.

---

## Kernregel

Die quiz-engine entscheidet **nicht**, wann sie aufgerufen wird.  
Das entscheidet der Server.  
Die quiz-engine rechnet nur, was ihr übergeben wird.

---

## Typen

Diese Typen kommen aus `packages/shared-types`.

```typescript
type QuestionType = "multiple_choice"; // MVP | 'estimate' | 'buzzer' // Phase 6+

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options?: { id: string; label: string }[]; // multiple_choice
  correctOptionId: string; // Option-ID bei MC
  durationMs: number; // Fragedauer in Millisekunden
  points: number; // Punkte für korrekte Antwort (Standard: 10)
}

interface SubmittedAnswer {
  playerId: string;
  questionId: string;
  answer: Answer; // { type: "option", value: string }
  submittedAtMs: number; // serverseitiger Zeitstempel des Eingangs (relativ zu Fragestart)
}

interface PlayerRoundResult {
  playerId: string;
  isCorrect: boolean;
  pointsEarned: number;
  answer: Answer | null; // null wenn keine Antwort gesendet
}

interface RoundResult {
  questionId: string;
  correctAnswer: CorrectAnswer;
  playerResults: PlayerRoundResult[];
}
```

---

## API – Multiple Choice (MVP)

### `evaluateMultipleChoice`

```typescript
function evaluateMultipleChoice(question: MultipleChoiceQuestion, answers: SubmittedAnswer[]): RoundResult;
```

**Verhalten:**

- Für jeden Spieler der eine Antwort gesendet hat: `isCorrect = answer.value === question.correctOptionId`
- Punkte via `scoreMultipleChoice(isCorrect, question.points)` berechnen
- Spieler die **keine** Antwort gesendet haben, werden **nicht** in `playerResults` aufgeführt — der Server muss Nicht-Antwortende separat mergen (0 Punkte, `isCorrect: false`, `answer: null`)
- Die Liste `answers` enthält nur valide, deduplizierte Antworten (Duplikate werden bereits vom Server gefiltert)

**Nicht zuständig für:**

- Timer-Durchsetzung (macht der Server)
- Antwort-Validierung (macht der Server vor dem Aufruf)
- Spieler die nicht in der Answerliste sind (werden nicht in results aufgenommen — Server merged später)

---

### `scoreMultipleChoice`

```typescript
function scoreMultipleChoice(isCorrect: boolean, points?: number): number;
```

**Punkteregeln (MVP):**

| Bedingung        | Punkte |
| ---------------- | ------ |
| Richtige Antwort | 10     |
| Falsche Antwort  | 0      |
| Keine Antwort    | 0      |

Keine Geschwindigkeitsboni im MVP. Das hält die Logik testbar und fair.

---

## Aufrufsequenz im Server

```
1. Timer läuft ab → Server setzt Game State auf answer_locked
2. Server sammelt alle SubmittedAnswers für diese Frage
3. Server ruft evaluateMultipleChoice(question, answers) auf
4. Server nimmt RoundResult und:
   a. aktualisiert den gesamten Spielstand (addiert pointsEarned pro Spieler)
   b. sendet question:reveal Event
   c. sendet score:update Event mit aktualisierten Gesamt-Scores
5. Server setzt Game State auf revealing → scoreboard
```

---

## Join-Code-Format

Join-Codes werden serverseitig generiert, nicht in der quiz-engine — aber hier dokumentiert weil zentral.

**Format:** 6 Zeichen, nur Großbuchstaben und Ziffern, ohne mehrdeutige Zeichen

```
Erlaubt:  A–Z (ohne I, O) + 0–9 (ohne 0, 1)
Beispiel: "R4T7KX"
Größe:    ca. 1,6 Milliarden mögliche Codes — ausreichend für MVP
```

**Warum keine mehrdeutigen Zeichen:** `I`/`1` und `O`/`0` werden auf kleinen Displays leicht verwechselt.

**Generierung:** kryptographisch zufällig (z.B. `crypto.randomBytes`), nicht sequenziell.

---

## Erweiterungen (Phase 6+)

Wenn weitere Spielmodi hinzukommen, werden hier ergänzt:

- `evaluateEstimate(question, answers)` – Punkte nach Nähe zum korrekten Wert
- `evaluateBuzzer(question, buzzerOrder, answer)` – Punkte nach Versuchsreihenfolge
- `scoreBuzzer(attemptNumber)` – 10 / 5 / 2 Punkte je nach Versuch

Diese Funktionen sind **nicht** Teil des MVP. Nichts davon vorab implementieren.
