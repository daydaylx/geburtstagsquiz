# ElevenLabs Vorbereitung Report

## Ergebnis

- Gefundene Fragen: 436
- Vorbereitete Question-Texte: 436
- Vorbereitete Reveal-Texte: 436
- Fehlende IDs: 0
- Doppelte IDs: 0
- URL-unsichere IDs: 0
- IDs ausserhalb des strengen Schemas q-KK-NN: 319
- Warnungen: 9

Empfehlung: Die Texte sind bereit fuer die manuelle ElevenLabs-Erstellung. Die Warnungen betreffen bereits bekannte P2-Fairness-Hinweise, nicht die Audio-Vorbereitung selbst.

## Quellen und Struktur

Die Fragen wurden aus diesen Dateien gelesen:

- data/quiz/questions/cat-01-harry-potter.json
- data/quiz/questions/cat-02-sex-liebe.json
- data/quiz/questions/cat-03-internet-slang.json
- data/quiz/questions/cat-05-party-drinks.json
- data/quiz/questions/cat-06-popkultur.json
- data/quiz/questions/cat-07-gaming.json
- data/quiz/questions/cat-08-musik.json
- data/quiz/questions/cat-09-adulting.json
- data/quiz/questions/cat-10-technik.json
- data/quiz/questions/cat-11-allgemeinwissen-logik.json

Roh-Typen im Katalog:

- common_mistake: 16
- estimate: 10
- estimate_duel: 1
- fast_guess: 11
- logic: 26
- majority_guess: 19
- multiple_choice: 311
- pattern: 10
- ranking: 16
- standard: 16

Normalisierte Laufzeittypen:

- estimate: 11
- logic: 26
- majority_guess: 19
- multiple_choice: 357
- open_text: 7
- ranking: 16

Nicht-kanonische Roh-Typen, die vom Server normalisiert werden: 54

## Integritaet

- Fehlende Erklaerungen/Aufloesungen: 0
- Doppelte Prompts: 0
- Strukturblocker fuer Audio-Vorbereitung: 0

Alle Fragen haben stabile, eindeutige und URL-sichere IDs. Die Dateinamen basieren deshalb auf der Frage-ID und nicht auf der Reihenfolge.

## Problematische Fragen

- q-02-fetisch-07: P2: Richtige Antwort (84 Zeichen) deutlich länger als Durchschnitt der falschen (43 Zeichen).
- q-02-fetisch-22: P2: Richtige Antwort (36 Zeichen) deutlich länger als Durchschnitt der falschen (12 Zeichen).
- q-09-25-f39bc42949: P2: Richtige Antwort (44 Zeichen) deutlich länger als Durchschnitt der falschen (17 Zeichen).
- q-10-01-a724282785: P2: Richtige Antwort (38 Zeichen) deutlich länger als Durchschnitt der falschen (11 Zeichen).
- q-10-04-681a745dc2: P2: Richtige Antwort (43 Zeichen) deutlich länger als Durchschnitt der falschen (18 Zeichen).
- q-10-07-c46b85b036: P2: Richtige Antwort (36 Zeichen) deutlich länger als Durchschnitt der falschen (6 Zeichen).
- q-10-08-e01d9ff8bd: P2: Richtige Antwort (40 Zeichen) deutlich länger als Durchschnitt der falschen (19 Zeichen).
- q-10-16-3375eefa44: P2: Richtige Antwort (43 Zeichen) deutlich länger als Durchschnitt der falschen (17 Zeichen).
- q-10-21-da25583664: P2: Richtige Antwort (41 Zeichen) deutlich länger als Durchschnitt der falschen (18 Zeichen).

## Zielordner fuer MP3-Dateien

- Fragen-Audios: apps/web-display/public/audio/questions/
- Reveal-Audios: apps/web-display/public/audio/reveals/

Die spaeteren Browser-Pfade sind in der Audio-Map als /audio/questions/{questionId}.mp3 und /audio/reveals/{questionId}.mp3 vorbereitet.

## Harte Constraints

- Keine ElevenLabs-API-Aufrufe ausgefuehrt
- Keine Audiodateien erzeugt
- Keine API-Keys oder Secrets erstellt
- Keine Spiel-Logik geaendert
- Keine Frageninhalte geaendert oder Antwortoptionen umsortiert
- Keine Aufloesung oder Markierung der richtigen Antwort im Frage-Audio
