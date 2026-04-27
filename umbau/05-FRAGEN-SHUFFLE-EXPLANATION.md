# 05 - Fragen, Shuffle, Explanation

## Aktueller Stand

Das Konzept beschreibt einige Punkte als Zukunftsarbeit, die im Repo schon teilweise erledigt sind:

- `explanation?: string` existiert bereits in allen Question-Typen.
- `question:reveal` erlaubt bereits `explanation`.
- Host und Player zeigen Erklaerungen bereits an.
- `quiz-data.ts` uebernimmt `explanation` oder `answer.context`.
- Der Fragenpool wird aus zwei JSON-Dateien geladen.
- Frage-IDs werden per Map dedupliziert.
- `getEveningQuestions` waehlt 30 Fragen.
- Tests pruefen keine doppelten Frage-IDs, keine Originalmutation und deterministischen Shuffle.

Gemessener Stand:

```text
Fragen gesamt:      520
mit Erklaerung:     518
ohne Erklaerung:      2
```

## Eigentliches Ziel

Nicht "mehr Fragen", sondern ein besserer Abendmix:

- Keine Wiederholung innerhalb eines Spiels.
- Abwechslungsreiche Fragetypen.
- Kurze, brauchbare Reveal-Erklaerungen.
- Keine kaputten Antworten.
- Keine peinlich schlechten Filler-Fragen.

## Shuffle und Auswahl

Aktuell ist die Auswahl proportional zum Katalog. Beispielhaft fuehrt das bei 520 Fragen zu starker MC-Dominanz.

Empfohlene spaetere Verbesserung:

- Zielverteilung fuer 30 Fragen explizit definieren.
- Kleine Typen wie Ranking, Majority und OpenText bewusst vertreten.
- Wenn ein Typ zu wenig Fragen hat, sauber auf andere Typen auffuellen.
- Original-Array nicht mutieren.
- Zufallsfunktion injizierbar lassen, damit Tests stabil bleiben.

Keine komplizierte Playlist-Engine bauen.

## Moegliche Zielverteilung

Vorschlag fuer 30 Fragen:

```text
multiple_choice  12
estimate          5
logic             4
ranking           3
majority_guess    3
open_text         3
```

Diese Verteilung ist eine Empfehlung, keine neue Spielmoduslogik. Sie soll nur den Abend abwechslungsreicher machen.

## Reveal-Erklaerungen

Regeln:

- Nur im Reveal sichtbar.
- 1 bis 3 Saetze.
- Klarer Kontext statt langer Artikel.
- Unterhaltsam, aber nicht platt.
- Keine Erklaerung, die die Antwort waehrend der aktiven Frage leakt.
- Erklaerungen fuer 18+-Begriffe sachlich halten.

Display zeigt Erklaerung prominent. Host zeigt sie kompakt. Player darf sie sehen, aber nicht als Hauptfokus.

## Fragenanalyse

Spaetere Review-Arbeit:

- Fehlende Erklaerungen finden.
- Doppelte oder nahezu doppelte Fragen markieren.
- Unklare Prompts markieren.
- Falsche Antworten oder kaputte Aliases markieren.
- Zu lange Antwortoptionen markieren.
- 18+-Inhalte bewusst pruefen.

Das vorhandene Review-Tool unter `tools/question-review/` nutzen, keine neue Editor-Plattform bauen.

## Tests

Pflichttests fuer spaetere Auswahl-Anpassungen:

- Keine doppelten Frage-IDs.
- Zielanzahl wird erreicht, wenn genug Fragen vorhanden sind.
- Typverteilung wird eingehalten, wenn genug Fragen vorhanden sind.
- Fallback funktioniert bei zu wenigen Fragen eines Typs.
- Original-Array wird nicht mutiert.
- Deterministische Zufallsfunktion macht Test stabil.
- Erklaerungen werden im Reveal weitergereicht.

## Betroffene Dateien

- `apps/server/src/game.ts`
- `apps/server/src/game.test.ts`
- `apps/server/src/quiz-data.ts`
- `packages/shared-types/src/question.ts`
- `packages/shared-protocol/src/schemas.ts`
- `apps/web-display/src/App.tsx` spaeter fuer Anzeige.
- `apps/web-host/src/App.tsx` nur falls Host-Reveal angepasst wird.
- `apps/web-player/src/App.tsx` nur fuer wording/Reveal.

## Grenzen

- Keine Fragenkatalog-Massenproduktion.
- Keine neue Kategorienverwaltung.
- Keine Quiz-Editor-App.
- Keine KI-generierte Fragenflut ohne Review.
- Keine neuen Spielmodi waehrend der 3-UI-Trennung.

