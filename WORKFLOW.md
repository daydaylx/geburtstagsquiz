# WORKFLOW.md

# Arbeitsablauf fuer dieses Repo

Dieser Workflow ist absichtlich klein gehalten. Das Repo soll nicht in Richtlinien ersticken, sondern ein Geburtstagsquiz fuer einen Abend liefern.

## Grundsatz

Erst verstehen, dann klein aendern, dann pruefen.

Nicht:

- Scope aufblasen
- Zukunftssysteme mitbauen
- aus jeder Aenderung eine Umstrukturierung machen

## 1. Relevanten Stand lesen

Vor einer Aenderung:

- betroffene Dateien lesen
- vorhandene Doku gegen den aktuellen Code pruefen
- herausfinden, was fuer den Kernfluss wirklich relevant ist

Nicht raten, wenn das Repo die Antwort schon zeigt.

## 2. Kleinsten sinnvollen Schritt waehlen

Jede Aufgabe soll auf den naechsten echten Nutzen reduziert werden.

Sinnvoll sind zum Beispiel:

- Join-Flow klarziehen
- Lobby konsistent machen
- eine Frage sauber von Anzeige bis Wertung durchziehen
- Doku an die tatsaechliche Implementierung anpassen

Nicht sinnvoll sind zum Beispiel:

- mehrere neue Modi parallel
- Architektur fuer spaeter erfinden
- Struktur aus Prinzip weiter aufteilen

## 3. Direkt und pragmatisch umsetzen

Beim Umsetzen gilt:

- bestehende Struktur respektieren
- keine doppelte Logik schaffen
- nur neue Dateien anlegen, wenn sie sofort Klarheit bringen
- keine Produkt- oder Plattformabstraktion einfuehren, wenn eine einfache Loesung reicht

## 4. Direkt danach pruefen

Nach einer Aenderung:

- passt der Kernfluss noch?
- ist der Server weiter die Wahrheit?
- sind Eventfluss und Zustaende nachvollziehbar?
- ist die Aenderung kleiner geblieben als die theoretisch moegliche Loesung?

Wenn etwas wacklig oder ueberkompliziert ist, offen benennen.

## 5. Vor dem Abend wichtiger als vor spaeter

Bei Zweifeln priorisieren:

- reale Handys statt theoretische Browsermatrix
- stabile Lobby statt Zusatzfeatures
- klarer Hostscreen statt Spielereien
- manuelle Testbarkeit statt Ausbauplan

## Regeln fuer Datei- und Strukturentscheidungen

- Neue Datei nur bei echtem Klarheitsgewinn.
- Shared-Code nur dann, wenn er wirklich von mehreren Stellen gebraucht wird.
- Kein Vorbauen fuer Accounts, Cloud, Persistenz, Admin, Teams, Buzzer, Joker oder Editor, solange sie fuer den Abend nicht noetig sind.

## Doku-Workflow

Wenn Verhalten, Eventfluss oder Scope geaendert werden, muessen die relevanten Doku-Dateien mitgezogen werden.

Code und Doku duerfen nicht in verschiedene Richtungen laufen.

## Schlussregel

Lieber ein kleiner, ehrlicher, funktionierender Stand als ein grosser, theoretisch sauberer, aber wackliger Entwurf.
