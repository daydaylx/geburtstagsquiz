# quiz-engine

## Zweck

`packages/quiz-engine` ist die reine Auswertungslogik.

- kein I/O
- kein WebSocket
- kein Raum-State
- serverseitig von `apps/server` genutzt

Der Server entscheidet, wann ausgewertet wird, validiert Antworten vorher und merged fehlende Antworten danach mit `0` Punkten.

## Aktive Fragetypen

Die Typen kommen aus `packages/shared-types`.

- `multiple_choice` und `logic`: Optionsantwort, richtig bei passender `correctOptionId`
- `estimate`: Zahlenantwort, Punkte fuer die naechste Antwort
- `majority_guess`: Optionsantwort, Punkte fuer die meistgewaehlte Option; bei Gleichstand zaehlen alle Top-Optionen
- `ranking`: Reihenfolgeantwort, Punkte nur bei exakt richtiger Reihenfolge
- `open_text`: Textantwort, Punkte bei normalisiert exakter Uebereinstimmung mit `correctText` oder `aliases`

## API

```typescript
function evaluateMultipleChoice(question, answers): RoundResult;
function evaluateEstimate(question, answers): RoundResult;
function evaluateMajorityGuess(question, answers): RoundResult;
function evaluateRanking(question, answers): RoundResult;
function evaluateOpenText(question, answers): RoundResult;
```

Die Funktionen erwarten bereits deduplizierte und zum Fragetyp passende Antworten. Sie liefern `RoundResult` mit `correctAnswer` und `playerResults` fuer Spieler, die eine Antwort gesendet haben.

Nicht zuständig:

- Timer-Durchsetzung
- Antwort-Validierung
- Raum- oder Spielerzustand
- Merge von Nicht-Antwortenden

## Server-Ablauf

1. Server schliesst die Frage.
2. Server uebergibt die gespeicherten Antworten an die passende Engine-Funktion.
3. Server addiert `pointsEarned` auf den Spielstand.
4. Server sendet `question:reveal`.
5. Server sendet danach `score:update`.

## Keine weiteren Modi

Buzzer, Teams, Joker oder weitere Modi werden hier nicht vorbereitet.
