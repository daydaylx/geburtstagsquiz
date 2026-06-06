Du verbesserst Quizfragen, ohne das JSON-Format zu brechen.

## Aufgabe

Verbessere die folgenden markierten Fragen. Behebe die genannten Probleme.

## Vorgaben

- Behalte das exakte JSON-Format bei
- Behalte die Frage-ID bei
- Behalte die Kategorie bei
- Behalte den Fragetyp bei
- Nur den Fragetext, die Optionen, die correct_option_id und die Erklärung verbessern
- Falsche Antworten müssen plausibel bleiben
- Antwortlängen ausbalancieren
- Keine neuen Muster einführen
- Erklärung klarer machen, falls nötig

## Ausgabeformat

Nur ein JSON-Array mit den verbesserten Fragen. Kein Markdown, kein Text.

Gleiche Struktur wie die Eingabe:

```json
[
  {
    "id": "...",
    "type": "multiple_choice",
    "prompt": "Verbesserter Fragetext?",
    "options": [...],
    "correct_option_id": "...",
    "explanation": "...",
    "difficulty": "...",
    "difficulty_score": N,
    "category_id": "...",
    "points": 1
  }
]
```

## Zu verbessernde Fragen

{{questions}}

## Gefundene Probleme

{{issues}}
