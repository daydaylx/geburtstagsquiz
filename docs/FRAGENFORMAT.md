# Fragenformat: So muss eine Frage aufgebaut sein

## Grundregel

Jede Frage besteht aus drei Teilen:

1. **Der Fragetext** — klar, eindeutig, auf dem TV gut lesbar
2. **Antwortmöglichkeiten** — je nach Fragetyp
3. **Erklärung** — kurzer Kontext zur Auflösung (wird nach dem Reveal gezeigt)

---

## Multiple-Choice / Standardfrage (Haupttyp)

Das ist der häufigste Fragetyp. 4 Antwortoptionen, davon genau 1 richtig.

### Pflichtfelder

| Feld | Beschreibung | Beispiel |
|---|---|---|
| `id` | Eindeutige ID im Format `q-KK-NN` | `q-01-07` |
| `type` | Fragetyp | `standard` oder `multiple_choice` |
| `prompt` | Der Fragetext (max. ~150 Zeichen für TV-Lesbarkeit) | `"Wie lautet das erste Gryffindor-Passwort?"` |
| `options` | Array mit genau 4 Optionen, je mit `id`, `text` und `is_correct` | siehe Beispiel unten |
| `correct_option_id` | ID der richtigen Option (als Backup-Angabe) | `"q-01-01-opt-1"` |
| `explanation` | Kurze Erklärung zur Antwort | `"Es ist Caput Draconis..."` |

### Optionale Felder

| Feld | Beschreibung |
|---|---|
| `difficulty` | `easy`, `medium` oder `hard` |
| `points` | Punkte für diese Frage (Standard: 1) |

### Beispiel (JSON)

```json
{
  "id": "q-01-01",
  "type": "standard",
  "prompt": "Wie lautet das allererste Gryffindor-Passwort, das wir im ersten Film hören?",
  "options": [
    { "id": "q-01-01-opt-1", "text": "Caput Draconis", "is_correct": true },
    { "id": "q-01-01-opt-2", "text": "Draco Dormiens", "is_correct": false },
    { "id": "q-01-01-opt-3", "text": "Schweineschnauze", "is_correct": false },
    { "id": "q-01-01-opt-4", "text": "Fortuna Major", "is_correct": false }
  ],
  "correct_option_id": "q-01-01-opt-1",
  "explanation": "Es ist 'Caput Draconis' (Drachenkopf). Percy fuehrt die Erstklaessler an, als waere er der CEO von Gryffindor.",
  "difficulty": "hard",
  "points": 1
}
```

### Checkliste für neue Multiple-Choice-Fragen

- [ ] Genau 4 Antwortoptionen
- [ ] Genau 1 Option hat `is_correct: true`
- [ ] `correct_option_id` verweist auf die richtige Option
- [ ] Fragetext ist klar und nicht mehrdeutig
- [ ] Fragetext ist kurz genug für die TV-Anzeige (~150 Zeichen)
- [ ] Falschantworten sind plausibel (keine offensichtlichen Ausschluss-Optionen)
- [ ] Erklärung liefert Kontext, warum die Antwort stimmt
- [ ] `id` ist eindeutig und folgt dem Schema `q-KK-NN`

---

## Weitere Fragetypen (Kurzübersicht)

### Logik (`logic`)
Wie Multiple-Choice, aber der Fokus liegt auf Schlussfolgerungen. Gleiches JSON-Format, `type: "logic"`.

### Schätzen (`estimate`)
Keine Optionen — Spieler schätzen einen Zahlenwert.

```json
{
  "id": "q-01-05",
  "type": "estimate",
  "prompt": "Wie viele Minuten Screen-Time hat Voldemort über alle 8 Filme?",
  "answer": {
    "canonical": "37 Minuten",
    "reference_value": 37,
    "unit": "Minuten",
    "context": "Total Screen Time"
  },
  "explanation": "Nur etwa 37 Minuten!",
  "difficulty": "hard",
  "points": 2
}
```

Pflicht: `prompt`, `answer.reference_value`, `answer.unit`, `explanation`.

### Ranking (`ranking`)
Spieler ordnen Items in die richtige Reihenfolge.

```json
{
  "id": "q-01-04",
  "type": "ranking",
  "prompt": "Ordne die Horkruxe nach ihrer Zerstörung.",
  "items": [
    { "id": "item-diary", "text": "Tom Riddles Tagebuch" },
    { "id": "item-locket", "text": "Slytherins Medaillon" },
    { "id": "item-cup", "text": "Hufflepuffs Trinkpokal" },
    { "id": "item-nagini", "text": "Nagini" }
  ],
  "correct_order": ["item-diary", "item-locket", "item-cup", "item-nagini"],
  "explanation": "Tagebuch (Teil 2), Medaillon (Teil 7.1), Pokal (Teil 7.2), Nagini (Finale).",
  "difficulty": "hard",
  "points": 2
}
```

Pflicht: `prompt`, `items` (je mit `id` + `text`), `correct_order`, `explanation`.

### Mehrheits-Tipp (`majority_guess`)
Wie Multiple-Choice, aber es gibt keine "richtige" Antwort — es zählt, was die Mehrheit tippt. Gleiche Struktur wie MC, aber ohne `correct_option_id` und ohne `is_correct`-Marker.

### Freitext (`open_text`)
Spieler tippt eine Freitext-Antwort. Pflicht: `prompt`, `answer.canonical` (richtige Antwort), `answer.aliases` (akzeptierte Alternativschreibweisen).

---

## Wo die Fragen leben

Alle Fragen stehen in der JSON-Datei im Repo-Root:

```
data/quiz/questions/cat-*.json
```

Struktur: `quiz.categories[].questions[]`.

Neue Fragen einfach im entsprechenden Kategorie-Block im JSON ergänzen, ID-Schema `q-KK-NN` beibehalten (`KK` = Kategorie-Nummer, `NN` = fortlaufende Nummer).
