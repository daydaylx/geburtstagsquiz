# Question Studio

Lokales Werkzeug zum Erzeugen neuer Quizfragen ueber OpenRouter.

## Start

```bash
corepack pnpm run question:studio
```

Oeffnet `http://127.0.0.1:4178`.

## API-Key

OpenRouter-API-Key wird benoetigt. Setze ihn in `.env.local` im Repo-Root:

```
OPENROUTER_API_KEY=sk-or-v1-...
```

`.env.local` wird von `.gitignore` ignoriert und niemals committet.

Alternativ als Umgebungsvariable:

```bash
OPENROUTER_API_KEY=sk-or-v1-... corepack pnpm run question:studio
```

## Workflow

1. Kategorie waehlen oder neue Kategorie als Draft anlegen
2. Free-Modell auswaehlen (wird dynamisch von OpenRouter geladen)
3. Qualitaetsmodus waehlen: Schnell / Besser / Streng
4. Schwierigkeit 1-5 und Anzahl festlegen
5. Regeln per Checkbox und Freitext setzen
6. Generieren
7. Fragen pruefen, behalten oder verwerfen
8. Draft speichern unter `data/quiz/questions/generated/`
9. Review mit dem bestehenden Review-Tool:

```bash
corepack pnpm run review:questions -- data/quiz/questions/generated/<datei>.json
```

## Qualitaetsmodi

| Modus | Ablauf |
| --- | --- |
| Schnell | Generate -> Validate -> Anzeigen |
| Besser | Generate -> Critique -> schlechte markieren -> Validate -> Anzeigen |
| Streng | Ueberproduktion -> Critique -> Rewrite -> Validate -> nur beste behalten |

## Tests

```bash
corepack pnpm run test:studio
```

## Grenzen

- Nur Drafts unter `data/quiz/questions/generated/`
- Keine Aenderung am finalen Fragenkatalog
- Kein Deploy, keine Datenbank
- Keine neuen Dependencies
