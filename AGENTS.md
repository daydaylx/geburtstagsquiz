# AGENTS.md

# Agentenrichtlinien fuer das Geburtstagsquiz

## Zweck des Projekts

Dieses Repo ist ein privates browserbasiertes Geburtstagsquiz fuer einen Abend.

Es ist:

- kein Produkt
- keine Plattform
- kein SaaS
- kein langfristiges Mehrzwecksystem

Optimiert wird auf:

- einfach
- stabil
- schnell startbar
- auf echten Handys benutzbar
- auf einem gemeinsamen Bildschirm gut lesbar

## Zielbild

Der gewuenschte Ablauf ist schlicht:

1. Host erstellt einen Raum
2. Host zeigt Code und QR an
3. Spieler joinen mit dem Handy
4. Lobby aktualisiert sich live
5. Host startet das Quiz
6. Fragen erscheinen auf dem Hauptscreen
7. Spieler antworten auf dem Handy
8. Der Server wertet aus
9. Der Hauptscreen zeigt Aufloesung und Rangliste

Wenn eine Aenderung diesem Ablauf nicht direkt hilft, ist sie verdaechtig.

## Harte Grenzen

Nicht Ziel dieses Repos:

- Accounts
- Profile
- Cloud-Speicherung
- mehrere Produktlinien
- Adminsysteme
- Moderation
- globale Highscores
- Chat
- Teams, Joker, Buzzer oder weitere Modi als Pflicht
- umfangreiche Editor- oder Import-Systeme
- ausgepraegtes Plattform- oder Skalierungsdenken

Technisch moeglich ist nicht automatisch sinnvoll.

## Architekturregeln

### 1. Server bleibt die Wahrheit

Der Server entscheidet ueber:

- Raumstatus
- aktive Frage
- Timer
- gueltige Antworten
- Punkte
- Rangliste

Clients duerfen anzeigen, senden und bestaetigen. Die entscheidende Spiellogik bleibt serverseitig.

### 2. Bestehende Trennung nur so weit nutzen, wie sie heute hilft

Die Repo-Struktur mit `apps/` und `packages/` ist schon da. Sie darf genutzt werden, aber nicht weiter aufgeblasen werden, nur weil es sauber aussieht.

Praktisch:

- `apps/web-host` fuer Hostscreen und Hoststeuerung
- `apps/web-player` fuer Join, Antwort und Spielerstatus
- `apps/server` fuer Raum, Spielstatus, Timer und Auswertung
- `packages/shared-*` nur fuer wirklich geteilte Definitionen
- `packages/quiz-engine` nur fuer echte Regel- und Scorelogik

### 3. Keine doppelte Wahrheitslogik

Wenn Eventnamen, Typen, Antworten oder Punkte an mehreren Stellen unabhaengig definiert werden, ist das ein Fehler.

### 4. Keine Zukunftssysteme ohne Abendnutzen

Nicht vorbauen fuer:

- spaetere Plattformfaehigkeit
- theoretische Skalierung
- Mehrmandantenbetrieb
- ausgefeilte Erweiterbarkeit
- moegliche Produktversionen

Was fuer einen Abend nicht gebraucht wird, wird nicht erfunden.

## UI-Regeln

### Player-UI

- grosse Touchflaechen
- keine verschachtelten Menues
- moeglichst kein Scrollen im Kernfluss
- klare Zustandsmeldungen
- wenig Text, wenig Ablenkung

### Hostscreen

- Frage gross lesbar
- Timer klar sichtbar
- Ergebnis und Rangliste aus Distanz erfassbar
- kein Entwickler-Dashboard-Look
- kein Effektballast auf Kosten der Lesbarkeit

## Validierung und Echtzeit

- Eingehende Events und Nutzdaten werden validiert.
- Doppelte Antworten duerfen nicht zaehlen.
- Timer darf nicht auf Client-Wahrheit beruhen.
- Reconnect ist sinnvoll, aber pragmatisch zu behandeln: Absicherung fuer Aussetzer, nicht Ausrede fuer komplexe Nebenarchitektur.

## Dokumentation

Die Doku soll technisch klar und knapp bleiben.

Pflichtkandidaten bei relevanten Aenderungen:

- `README.md`
- `docs/architecture.md`
- `docs/event-protocol.md`
- `docs/state-machine.md`
- `docs/IMPLEMENTATION.md`
- `docs/CONSTRAINTS.md`
- `docs/GAME-RULES.md`

Keine Marketingtexte. Keine Roadmap-Prosa. Keine Produktvision erfinden.

## Review-Fragen fuer Agenten

Vor und nach einer Aenderung ist zu pruefen:

- Hilft das direkt dem Quiz-Abend?
- Wird der Kernfluss einfacher oder nur theoretisch sauberer?
- Ist Logik doppelt?
- Ist der Server noch klar authoritative?
- Wird eine neue Abstraktion wirklich gebraucht?
- Ist die Player-UI auf dem Handy noch klar?
- Ist der Hostscreen noch aus Distanz benutzbar?

## Arbeitsstil

Ein Agent soll:

1. erst lesen
2. dann den kleinsten sinnvollen Schritt waehlen
3. keine Zusatzsysteme mitschieben
4. Risiken offen benennen
5. Scope aktiv klein halten

Ein Agent soll nicht:

- das Repo in ein Produkt umbauen
- fuer spaetere Faelle vorbauen
- halbfertige Zusatzfeatures als Fortschritt verkaufen
- aus einem Geburtstagsquiz eine Architekturuebung machen

## Schlussregel

Wenn die Wahl zwischen "architektonisch huebsch" und "fuer den Abend verlaesslich" besteht, gewinnt die verlaessliche Loesung.
