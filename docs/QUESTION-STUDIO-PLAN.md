# Question Studio Umsetzungsplan

Stand: 2026-06-05

## Ziel

Ein kleines lokales GUI-Werkzeug fuer die Vorbereitung neuer Quizfragen bauen.

Das Tool nutzt OpenRouter als Provider, laedt freie Modelle dynamisch, erzeugt Draft-Fragen im passenden Format und gibt sie erst nach Validierung und Review frei.

## Nicht-Ziel

Dieses Vorhaben ist keine Erweiterung des Live-Quiz-Abendbetriebs.

Nicht umsetzen:

- keine Spielerfunktion
- keine Displayfunktion
- keine Hostfunktion
- keine WebSocket-Aenderung
- keine Spielmechanik-Aenderung
- kein Cloud-Deploy
- keine Datenbank
- kein Login
- keine neue Plattform

## Empfohlene Reihenfolge

Erst Qualitaetssicherung, dann KI-Generierung.

Wenn zuerst die GUI gebaut wird und der Validator fehlt, entsteht nur ein komfortabler Muellgenerator. Also genau nicht so.

## Phase 0: Repo-Kontext lesen

Vor jeder Umsetzung lesen:

- `README.md`
- `AGENTS.md`
- `CLAUDE.md`
- `WORKFLOW.md`
- `package.json`
- `scripts/audit-questions.mjs`
- `tools/question-review/server.mjs`
- bestehende Dateien unter `data/quiz/questions/`

Ergebnis dieser Phase:

- tatsaechliches Fragenformat dokumentieren
- Pflichtfelder bestimmen
- ID-Schema bestimmen
- bestehende Audit-Regeln verstehen
- keine Annahmen aus dem Bauch heraus treffen

## Phase 1: Fragen-Schema und Draft-Format definieren

### Aufgabe

Ein kanonisches Draft-Schema fuer generierte Fragen definieren.

### Dateien

Vorschlag:

```text
tools/question-studio/schemas/question-draft.schema.json
```

oder, wenn im Repo bereits Zod/TypeScript fuer Fragen besser passt:

```text
tools/question-studio/src/schema.ts
```

### Regeln

Das Schema muss mindestens pruefen:

- Kategorie-Metadaten
- eindeutige Frage-ID
- Fragetyp
- Prompt/Text der Frage
- exakt 4 Multiple-Choice-Optionen
- eindeutige Option-IDs
- genau eine richtige Antwort
- `correct_option_id` existiert
- Erklaerung vorhanden
- Schwierigkeit 1-5
- Punkte oder Mapping auf bestehende Punkte-Logik

### Akzeptanzkriterien

- bestehende Fragen koennen gegen die erwartete Struktur verglichen werden
- ungueltige Drafts werden hart abgelehnt
- Fehler sind lesbar und nicht nur Stacktraces

## Phase 2: Validator und Normalizer bauen

### Aufgabe

Bevor irgendein Modell angebunden wird, muss ein Validator existieren.

### Funktionen

- JSON sicher parsen
- KI-Meta-Text ablehnen oder JSON-Block extrahieren
- Felder normalisieren
- fehlende IDs erzeugen, falls erlaubt
- Antwortoptionen mischen
- `correct_option_id` korrekt nachziehen
- richtige Antwortpositionen statistisch pruefen
- Duplikate innerhalb eines Drafts erkennen
- grobe Duplikate gegen bestehende Fragen erkennen

### Warnungen

Warnen, aber nicht zwingend blockieren:

- Antwortoptionen stark unterschiedlich lang
- Frage zu kurz oder zu vage
- Erklaerung sehr duenn
- sehr aehnliche Antwortoptionen
- moegliche Faktenunsicherheit

### Akzeptanzkriterien

- Validator kann ueber CLI oder lokale Serverroute ausgefuehrt werden
- falsches Format wird abgefangen
- richtige Antwortpositionen werden nicht systematisch A/B/C/D-lastig
- Draft wird nie ungeprueft gespeichert

## Phase 3: OpenRouter Model Loader

### Aufgabe

Freie Modelle dynamisch aus OpenRouter laden.

### API

```http
GET https://openrouter.ai/api/v1/models
Authorization: Bearer <OPENROUTER_API_KEY>
```

### Filter

Free-Modell, wenn:

```ts
pricing.prompt === "0" && pricing.completion === "0"
```

Optional zusaetzlich pruefen:

```ts
model.id.includes(":free")
```

Aber `:free` darf nicht der einzige Filter sein.

### UI-Anzeige

Pro Modell anzeigen:

- Name
- ID
- Context Length
- Provider/Architektur, falls vorhanden
- Pricing als "Free"
- optional Beschreibung

### Cache

- Modellliste lokal cachen
- Refresh-Button anbieten
- Fehler bei API-Ausfall anzeigen

### Akzeptanzkriterien

- GUI zeigt nur Free-Modelle als Standard
- manuelles Aktualisieren moeglich
- keine fest verdrahtete Free-Modellliste notwendig
- fehlender API-Key wird sauber gemeldet

## Phase 4: OpenRouter Chat Completion Client

### Aufgabe

Generierung ueber OpenRouter anbinden.

### API

```http
POST https://openrouter.ai/api/v1/chat/completions
Authorization: Bearer <OPENROUTER_API_KEY>
Content-Type: application/json
```

### Mindestpayload

```json
{
  "model": "<selected-model-id>",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "temperature": 0.7
}
```

### Regeln

- API-Key nur serverseitig verwenden
- keine API-Aufrufe direkt aus dem Browser
- Timeouts setzen
- Fehler aus OpenRouter lesbar weitergeben
- Response niemals blind speichern
- Modellantwort zuerst validieren

### Akzeptanzkriterien

- mit einem ausgewaehlten Free-Modell kann ein Draft erzeugt werden
- fehlgeschlagene Requests werden sauber angezeigt
- ungueltige Modellantworten werden nicht gespeichert

## Phase 5: Prompt-Dateien anlegen

### Dateien

```text
tools/question-studio/prompts/generate.md
tools/question-studio/prompts/critique.md
tools/question-studio/prompts/rewrite.md
```

### Generate-Prompt

Muss verlangen:

- nur JSON ausgeben
- keine Markdown-Erklaerung
- keine Kommentare
- Kategorie-Kontext beachten
- Schwierigkeit 1-5 beachten
- exakt 4 Antwortoptionen
- plausible falsche Antworten
- eine richtige Antwort
- kurze Erklaerung
- keine offensichtliche Musterbildung

### Critique-Prompt

Bewertet:

- Eindeutigkeit
- Schwierigkeit
- Plausibilitaet der falschen Antworten
- Antwortlaengen
- Mehrdeutigkeit
- Stilbruch
- Faktenrisiko

### Rewrite-Prompt

Verbessert nur markierte Fragen, ohne Format zu brechen.

### Akzeptanzkriterien

- Prompts sind projektbezogen und kurz
- Prompts enthalten keine generischen Agenten-Floskeln
- Output bleibt maschinenlesbar

## Phase 6: Lokalen Server bauen

### Empfehlung

Ein einfacher Node-Server reicht.

Startbefehl spaeter:

```bash
corepack pnpm run question:studio
```

### Routen

Mindest-Routen:

```text
GET  /api/models
POST /api/generate
POST /api/validate
POST /api/save-draft
GET  /api/categories
POST /api/categories/draft
```

### Dateizugriffe

Lesen:

```text
data/quiz/questions/
```

Schreiben nur nach:

```text
data/quiz/questions/generated/
```

Keine finalen Katalogdateien automatisch veraendern.

### Akzeptanzkriterien

- Server startet lokal
- Server meldet fehlenden API-Key sauber
- Server schreibt nur in den Draft-Ordner
- keine Secrets werden geloggt

## Phase 7: Kleine GUI bauen

### Ziel

Eine einfache lokale Weboberflaeche, nicht huebsches Theater.

### Views

#### 1. Generator

Felder:

- Kategorie
- neue Kategorie anlegen
- Modell
- Qualitaetsmodus
- Schwierigkeit 1-5
- Anzahl
- Regel-Presets
- Checkbox-Regeln
- Zusatzregeln
- Generieren-Button

#### 2. Ergebnisliste

Pro Frage anzeigen:

- Frage
- Antwortoptionen
- richtige Antwort
- Erklaerung
- Validator-Warnungen
- Status: behalten / bearbeiten / verwerfen / unsicher

#### 3. Draft speichern

- Dateiname anzeigen
- Speicherort anzeigen
- Hinweis auf Review-Tool anzeigen

### Akzeptanzkriterien

- Bedienbar ohne Erklaerungsroman
- keine UI-Abhaengigkeit vom Live-Quiz
- funktioniert lokal im Browser
- Fehler sind sichtbar und klar

## Phase 8: Qualitaetsmodi

### Schnell

- Generate
- Validate
- Save Draft

### Besser

- Generate
- Critique
- Markiere schlechte Fragen
- Validate
- Save Draft

### Streng

- mehr Fragen erzeugen als angefordert
- Critique
- Rewrite brauchbarer Fragen
- Validate
- nur bestandene Fragen anbieten

### Akzeptanzkriterien

- Modus ist sichtbar
- Streng erzeugt nicht einfach blind alles
- schlechte Fragen werden nicht versteckt

## Phase 9: Integration in bestehende Scripts

### package.json

Moeglicher Script:

```json
{
  "scripts": {
    "question:studio": "node tools/question-studio/server.mjs"
  }
}
```

Nur hinzufuegen, wenn das Tool tatsaechlich existiert.

### README-Ergaenzung

Kurzer Abschnitt:

```text
Fragen generieren:
corepack pnpm run question:studio
```

Aber erst nach funktionierender Umsetzung, nicht im Konzeptstadium.

## Phase 10: Tests und Checks

### Mindestens testen

- Validator mit gueltigem Draft
- Validator mit kaputtem JSON
- Validator mit fehlender richtiger Antwort
- Validator mit zwei richtigen Antworten
- Antwort-Shuffle korrigiert `correct_option_id`
- Free-Modell-Filter erkennt kostenlose Modelle
- fehlender API-Key gibt klare Fehlermeldung
- Draft wird nur in `generated/` geschrieben

### Repo-Checks

Nach Umsetzung:

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm run audit:questions
corepack pnpm build
```

Oder komplett:

```bash
corepack pnpm run validate
```

Wenn Checks nicht laufen, Grund konkret dokumentieren.

## Empfohlener V1-Schnitt

V1 ist fertig, wenn Folgendes funktioniert:

- lokaler Startbefehl
- API-Key ueber `.env.local` oder Environment
- OpenRouter-Free-Modelle werden geladen
- Kategorie kann gewaehlt werden
- Schwierigkeit 1-5 funktioniert
- Regeln koennen gesetzt werden
- Fragen werden generiert
- Validator prueft hart
- Antwortpositionen werden gemischt
- Ergebnis kann manuell angenommen/verworfen werden
- Draft wird in `data/quiz/questions/generated/` gespeichert
- bestehendes Review-Tool kann danach genutzt werden

Nicht in V1:

- perfekter Editor
- komplexe Prompt-Bibliothek
- automatische Faktenrecherche
- Multi-Provider ausser OpenRouter
- Live-Sync mit Host-App
- finale Katalog-Merges per Button

## Offene Entscheidungen vor Umsetzung

Vor Codebeginn klaeren:

1. Soll das Tool reines `server.mjs + public/app.js` bleiben oder TypeScript bekommen?
2. Soll es in `tools/question-studio/` ohne neue Dependencies starten?
3. Soll `openrouter/free` als Auto-Option sichtbar sein?
4. Sollen neue Kategorien sofort als echte Kategorie-Datei gespeichert werden oder nur als Draft-Preset?
5. Soll der Generator bestehende Kategorie-Dateien lesen und Stilbeispiele daraus ableiten?

Empfehlung:

- V1 ohne neue grosse Dependencies
- `tools/question-studio/`
- `openrouter/free` optional anzeigen
- neue Kategorien zuerst als Draft-Preset
- bestehende Kategorien als Stil-/Formatbeispiele lesen

## Agenten-Prompt fuer die spaetere Umsetzung

```text
Du arbeitest im Repo daydaylx/geburtstagsquiz.

Aufgabe:
Baue ein kleines lokales Question Studio unter tools/question-studio/, das neue Quizfragen ueber OpenRouter vorbereitet. Es darf den Live-Quiz-Abendbetrieb nicht veraendern.

Lies zuerst:
- README.md
- AGENTS.md
- CLAUDE.md
- WORKFLOW.md
- docs/QUESTION-STUDIO-CONCEPT.md
- docs/QUESTION-STUDIO-PLAN.md
- scripts/audit-questions.mjs
- tools/question-review/server.mjs
- bestehende JSON-Dateien unter data/quiz/questions/

Harte Regeln:
- Kein Deploy.
- Keine Datenbank.
- Keine Accounts.
- Keine echten Secrets ins Repo.
- Keine finalen Fragenkataloge automatisch ueberschreiben.
- Nur Drafts unter data/quiz/questions/generated/ schreiben.
- OpenRouter API-Key nur serverseitig verwenden.
- Free-Modelle dynamisch ueber GET https://openrouter.ai/api/v1/models laden.
- Standardfilter: pricing.prompt === "0" und pricing.completion === "0".
- Generierte Antworten niemals blind speichern; immer validieren.
- Antwortoptionen mischen und correct_option_id korrekt nachziehen.

Arbeitsmodus:
1. Analysiere zuerst das existierende Fragenformat und Audit-Tool.
2. Schlage einen minimalen Umsetzungsplan vor.
3. Warte auf GO, bevor du Code aenderst.
4. Nach GO klein und gezielt implementieren.
5. Keine unnoetigen Dependencies.
6. Nach Umsetzung passende Checks ausfuehren oder konkret begruenden, warum sie nicht laufen konnten.

Definition of Done:
- corepack pnpm run question:studio startet lokal.
- GUI zeigt OpenRouter-Free-Modelle.
- Kategorie, Schwierigkeit 1-5, Anzahl und Regeln sind waehlbar.
- Fragen werden generiert, normalisiert, validiert und angezeigt.
- Nutzer kann Fragen behalten/verwerfen.
- Draft wird unter data/quiz/questions/generated/ gespeichert.
- Bestehendes Review-Tool bleibt nutzbar.
```

## Kritische Einschätzung

Das Vorhaben ist sinnvoll, solange es ein lokaler Produktionshelfer bleibt.

Der gefaehrliche Punkt ist nicht OpenRouter. Der gefaehrliche Punkt ist Scope Creep: Sobald daraus ein halber Editor mit zu vielen Features wird, frisst das Tool mehr Zeit, als es beim Fragenbauen spart.

Deshalb gilt fuer V1:

```text
Generator + Validator + Draft-Speichern. Mehr nicht.
```
