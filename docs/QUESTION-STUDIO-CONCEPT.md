# Question Studio Konzept

Stand: 2026-06-05

## Kurzfassung

Das **Question Studio** ist ein kleines lokales Werkzeug zum Erzeugen, Pruefen und Vorbereiten neuer Quizfragen fuer dieses Privatquiz.

Es ist **kein** neues Produkt, kein Admin-System und keine Plattform. Es soll nur ein konkretes Problem loesen:

- neue Fragen schneller erzeugen
- immer das passende JSON-Format treffen
- Antwortmuster wie "richtig ist staendig A" verhindern
- Kategorien und Schwierigkeitsgrade kontrolliert pflegen
- verschiedene OpenRouter-Free-Modelle fuer unterschiedliche Frage- und Antwortstile nutzbar machen
- schlechte KI-Fragen vor dem echten Fragenkatalog abfangen

Das Tool schreibt niemals direkt ungeprueft in den finalen Fragenkatalog. Es erzeugt Draft-Dateien, die danach reviewt und bewusst uebernommen werden.

## Harte Grenze

Dieses Tool darf das Repo nicht in ein Quiz-CMS verwandeln.

Nicht bauen:

- keine Accounts
- keine Cloud-Datenbank
- keine oeffentliche Admin-Oberflaeche
- kein Deployment fuer das Question Studio
- kein komplexes Rollen-/Rechtesystem
- keine direkte Aenderung am Abendbetrieb
- keine automatische Veroeffentlichung generierter Fragen
- keine echten API-Keys im Repository

Wenn eine Funktion nicht direkt bessere Fragen erzeugt, prueft oder sicher exportiert, gehoert sie nicht in Version 1.

## Zielnutzer

Primaer ein lokaler Host/Entwickler, der vor dem Quiz-Abend neue Fragen vorbereiten will.

Das Tool ist nicht fuer Spieler gedacht.

## Grundidee

Lokale Mini-GUI:

1. Kategorie auswaehlen oder neue Kategorie anlegen
2. OpenRouter-Free-Modell auswaehlen
3. Schwierigkeit 1 bis 5 waehlen
4. Anzahl Fragen festlegen
5. Regeln per Checkbox und optionalem Freitext setzen
6. Fragen generieren
7. Fragen automatisch normalisieren und validieren
8. Fragen einzeln annehmen, bearbeiten oder verwerfen
9. Draft-JSON speichern
10. Draft mit bestehendem Review-Tool pruefen

## OpenRouter als Provider

Das Question Studio soll am Ende ueber OpenRouter laufen.

### Modelle laden

Die GUI soll die verfuegbaren Modelle nicht hart codieren, sondern ueber die OpenRouter Models API laden:

```http
GET https://openrouter.ai/api/v1/models
Authorization: Bearer <OPENROUTER_API_KEY>
```

Aus der Antwort wird die Modellliste fuer die GUI gebaut.

### Free-Modelle filtern

Standardverhalten: nur kostenlose Modelle anzeigen.

Primaerer Filter:

- `pricing.prompt === "0"`
- `pricing.completion === "0"`
- `pricing.request === "0"` oder nicht relevant
- optional: `id` enthaelt oder endet auf `:free`, aber das ist nur ein Zusatzsignal, kein alleiniger Filter

Grund: Modellnamen und Free-Verfuegbarkeit koennen sich aendern. Eine fest eingebaute Liste waere schnell veraltet.

### Sonderfall `openrouter/free`

`openrouter/free` kann als Komfortoption angeboten werden, aber nicht als Ersatz fuer die echte Modellliste.

Warum:

- Vorteil: sehr einfache kostenlose Nutzung
- Nachteil: Routing waehlt Free-Modelle automatisch/randomisiert
- Nachteil: fuer reproduzierbare Fragenqualitaet schlechter nachvollziehbar

Empfehlung:

- Standard: konkretes Free-Modell auswaehlen
- Optional: `openrouter/free` als "Auto Free Router"

### Rate Limits realistisch behandeln

Free-Nutzung ist begrenzt. Das Tool muss damit rechnen, dass Generierung fehlschlaegt oder gedrosselt wird.

Konsequenzen:

- kleine Batchgroessen bevorzugen
- Retry nur vorsichtig
- Fehlermeldung klar anzeigen
- keine Endlosschleifen
- Modellwechsel anbieten
- Cache fuer Modellliste verwenden

## API-Key und Sicherheit

Der API-Key wird lokal gehalten.

Erlaubt:

- `.env.local`
- Umgebungsvariable `OPENROUTER_API_KEY`
- optional lokale Settings-Datei, die in `.gitignore` steht

Nicht erlaubt:

- Key in `docs/`
- Key in `data/`
- Key in Beispiel-Drafts
- Key in Commits
- Key im Browser-LocalStorage, wenn die GUI ueber einen lokalen Server laeuft

Besser:

- lokaler Node-Server haelt den Key
- Browser-GUI spricht nur den lokalen Server an
- API-Aufrufe an OpenRouter passieren serverseitig

## GUI-Konzept

### Hauptmaske

Felder:

- Kategorie
- Neue Kategorie anlegen
- Modell
- Qualitaetsmodus
- Schwierigkeit 1-5
- Anzahl Fragen
- Fragetyp, in V1 nur Multiple Choice verbindlich
- Regel-Presets
- Regel-Checkboxen
- Zusatzregeln
- Button: Fragen generieren

### Kategorie-Auswahl

Kategorie-Daten muessen mehr enthalten als nur einen Namen.

Felder:

- Name
- Slug/ID
- Kurzbeschreibung
- Zielgruppe
- Standard-Stil
- erlaubte Themen
- verbotene Themen
- Standard-Schwierigkeitsbereich

Beispiel:

```text
Name: Grundschulwissen fuer Erwachsene
Beschreibung: Fragen, die formal Grundschulniveau haben, aber Erwachsene zum Nachdenken bringen. Keine simplen Rechenfragen. Alltag, Sprache, Natur, Logik und Sachwissen bevorzugen.
Zielgruppe: Erwachsene
Stil: klar, leicht frech, aber nicht albern
```

### Schwierigkeit 1-5

| Stufe | Bedeutung |
| --- | --- |
| 1 | sehr einfach, fast jeder weiss es |
| 2 | einfach, mit kurzem Nachdenken loesbar |
| 3 | mittel, solides Allgemeinwissen noetig |
| 4 | schwer, viele liegen falsch |
| 5 | fies, aber fair; nicht unfair, nicht willkuerlich |

Wichtig: Schwierigkeit 5 bedeutet nicht schlechte Formulierung, Spezialwissen ohne Kontext oder absichtliche Irrefuehrung.

### Regel-Checkboxen

Pflicht fuer V1:

- keine mehrfach richtigen Antworten
- keine offensichtlich herausstechende richtige Antwort
- falsche Antworten muessen plausibel sein
- Antwortlaengen sollen halbwegs ausgeglichen sein
- keine Fangfragen, ausser explizit erlaubt
- keine Datumsfragen, ausser explizit erlaubt
- Erklaerung kurz und nachvollziehbar
- keine Fragen, die nur durch Raten funktionieren
- keine doppelten oder sehr aehnlichen Fragen
- richtige Antwortposition automatisch mischen

### Zusatzregeln

Freitext ist erlaubt, aber nur als Zusatz, nicht als Ersatz fuer feste Regeln.

Beispiele:

```text
Fragen sollen fuer Erwachsene sein, aber nicht trocken wirken.
```

```text
Keine Fragen ueber aktuelle Politik oder Promis.
```

```text
Falsche Antworten duerfen lustig sein, aber nicht komplett absurd.
```

## Qualitaetsmodi

### Schnell

- ein Modell generiert Fragen
- Code normalisiert und validiert
- geeignet fuer grobe Drafts

### Besser

- Modell generiert Fragen
- zweiter Prompt kritisiert Fragen
- schlechte Fragen werden markiert
- Code validiert

### Streng

- Modell generiert mehr Fragen als benoetigt
- Kritiker-Prompt bewertet jede Frage
- Rewrite-Prompt verbessert brauchbare Fragen
- Code validiert hart
- nur bestandene Fragen werden als Draft gespeichert

Empfehlung fuer echte Quizfragen: **Besser** oder **Streng**.

## Datenfluss

```text
GUI-Eingabe
  -> lokaler Question-Studio-Server
  -> OpenRouter Models API fuer Modellliste
  -> OpenRouter Chat Completions fuer Generierung
  -> JSON-Extraktion
  -> Normalisierung
  -> Validierung
  -> Antwortoptionen mischen
  -> Duplikatpruefung
  -> Ergebnis-Review in GUI
  -> Draft-Datei in data/quiz/questions/generated/
  -> bestehendes Review-Tool
  -> bewusste Uebernahme in finalen Fragenkatalog
```

## Ausgabeformat

Generierte Dateien landen zuerst in:

```text
data/quiz/questions/generated/
```

Namensschema:

```text
<category-slug>-draft-YYYY-MM-DD-HHMM.json
```

Beispiel:

```text
data/quiz/questions/generated/grundschulwissen-erwachsene-draft-2026-06-05-1842.json
```

## Validierung

Der Validator ist wichtiger als die KI.

Mindestregeln:

- JSON ist syntaktisch gueltig
- Kategorie-Metadaten vorhanden
- jede Frage hat eine eindeutige ID
- jede Multiple-Choice-Frage hat exakt 4 Optionen
- genau eine Antwort ist korrekt
- `correct_option_id` verweist auf eine existierende Option
- Erklaerung ist vorhanden
- Schwierigkeit ist 1-5
- Fragetyp ist erlaubt
- Antwortpositionen werden gleichmaessig verteilt
- keine offensichtlichen Duplikate innerhalb des Drafts
- keine offensichtlichen Duplikate gegen bestehende Kategorien

Warnungen statt harter Blockade:

- Antwortoptionen stark unterschiedlich lang
- Frage wirkt zu leicht fuer gewaehlte Stufe
- Erklaerung ist sehr allgemein
- Frage enthaelt unsichere Fakten
- Modell hat Hinweise oder Meta-Text statt sauberem JSON geliefert

## Review-Status

Die GUI soll pro Frage mindestens diese Aktionen anbieten:

- behalten
- bearbeiten
- verwerfen
- erneut formulieren lassen
- als unsicher markieren

Kein automatisches Uebernehmen in finale Dateien.

## Architektur-Vorschlag

Pfad:

```text
tools/question-studio/
```

Moegliche Struktur:

```text
tools/question-studio/
|- server.mjs
|- public/
|  |- index.html
|  |- app.js
|  `- styles.css
|- prompts/
|  |- generate.md
|  |- critique.md
|  `- rewrite.md
|- schemas/
|  `- question-draft.schema.json
`- README.md
```

V1 darf bewusst einfach bleiben:

- Node-Server
- kleine browserbasierte UI
- keine schwere Desktop-App
- keine neue Build-Kette, falls vermeidbar
- keine neue Datenbank

## Abgrenzung zum bestehenden Review-Tool

Das bestehende Review-Tool bleibt fuer manuelle Pruefung relevant.

Das Question Studio sitzt davor:

```text
Question Studio: erzeugt und filtert Drafts
Review-Tool: prueft und markiert Fragen manuell
Finaler Katalog: wird bewusst gepflegt
```

## Risiken

### KI-Muell wird schneller produziert

Gegenmassnahme:

- mehr Fragen generieren als benoetigt
- Kritiker-Modus
- harte Validierung
- manuelle Auswahl

### Free-Modelle wechseln staendig

Gegenmassnahme:

- Modellliste dynamisch laden
- Cache mit Refresh-Button
- keine Modellliste fest einbauen

### Format driftet

Gegenmassnahme:

- JSON-Schema
- Parser blockiert ungueltige Ausgaben
- Prompt verlangt nur JSON
- Validator ist Pflicht

### Stil wird inkonsistent

Gegenmassnahme:

- Kategorie-Presets
- Stil-Presets
- feste Regel-Checkboxen
- Zusatzregeln nur als Ergaenzung

### Overengineering

Gegenmassnahme:

- V1 bleibt lokal
- keine Produktfeatures
- keine neuen Spielmodi
- kein Deploy
- kein Editor-Monster

## Definition of Done fuer das Konzept

Das Question Studio ist gelungen, wenn:

- neue Fragen schneller entstehen
- das Format verlaesslich passt
- Antwortpositionen nicht mehr auffaellig sind
- schlechte Fragen sichtbar markiert werden
- Drafts ohne Risiko erzeugt werden
- bestehende Review- und Validierungsablaeufe nutzbar bleiben
- das Tool nicht den eigentlichen Quiz-Abend komplizierter macht
