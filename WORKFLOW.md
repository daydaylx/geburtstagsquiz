# WORKFLOW.md

# Arbeitsablauf für Agenten im Quiz-Dual-Screen-Projekt

## Ziel dieses Workflows

Dieser Workflow soll verhindern, dass ein Agent:

- zu viel gleichzeitig umbaut
- den Scope unnötig aufbläst
- instabile Architektur produziert
- Client-Logik falsch priorisiert
- halbfertige Features stapelt
- den Basisfluss kaputtentwickelt

Der Workflow ist absichtlich strikt.

---

## Grundprinzip

Erst:

- verstehen
- begrenzen
- strukturieren
- klein umsetzen
- prüfen
- härten

Dann erst erweitern.

Nicht andersherum.

---

## Phase 0 – Verstehen und Eingrenzen

Bevor Code geändert wird, muss der Agent klären:

- Was ist das konkrete Ziel dieser Phase?
- Welche Teile des Projekts sind dafür wirklich relevant?
- Welche Teile sind ausdrücklich **nicht** Teil dieser Phase?
- Welche Risiken entstehen, wenn jetzt zu viel gebaut wird?

### Pflichtausgabe in dieser Phase

- kurze Zielbeschreibung
- betroffene Ordner / Dateien
- klare Nicht-Ziele
- erkennbare Risiken

### Verboten in dieser Phase

- sofortiger Umbau großer Teile
- Einführen zusätzlicher Systeme ohne Not
- Ausweiten des Scopes „weil es später nützlich sein könnte"

---

## Phase 1 – Struktur und Plan

Vor der Umsetzung muss ein Agent einen kleinen, realistischen Plan aufstellen.

### Der Plan muss enthalten

- welches Problem gelöst wird
- welche Dateien wahrscheinlich angepasst oder erstellt werden
- welche Architekturregel relevant ist
- welche Abnahmekriterien gelten
- was absichtlich noch **nicht** gebaut wird

### Der Plan darf nicht sein

- vage
- zu groß
- voller Zukunftsphantasien
- voller optionaler Nebensysteme

---

## Phase 2 – Kleinste sinnvolle Vertikalscheibe umsetzen

Es wird nur der kleinste sinnvolle, belastbare Schritt umgesetzt.

### Beispiele

#### Sinnvoll

- Raum erstellen + Lobby synchronisieren
- Join-Code + Join per Player-UI
- eine Multiple-Choice-Frage komplett von Start bis Auswertung

#### Nicht sinnvoll

- gleichzeitig Lobby, Rangliste, Buzzer, Teams und Quiz-Editor bauen

---

## Phase 3 – Selbstprüfung direkt nach der Umsetzung

Nach jeder Umsetzung muss der Agent prüfen:

- Ist die Lösung kleiner geblieben als ursprünglich möglich?
- Ist die Spielwahrheit serverseitig geblieben?
- Wurde Logik doppelt definiert?
- Sind Eventnamen und Payloads konsistent?
- Ist etwas unnötig kompliziert geworden?
- Sind neue Dateien klar benannt und sauber eingeordnet?
- Wurde Scope heimlich ausgeweitet?

### Pflicht

Wenn Probleme auftauchen, müssen sie offen benannt werden.
Kein Schönreden.

---

## Phase 4 – Review vor Erweiterung

Bevor die nächste Phase beginnt, wird geprüft:

- Ist die aktuelle Phase wirklich stabil genug?
- Fehlen noch offensichtliche Härten?
- Gibt es Reconnect-, Timer- oder Event-Schwächen?
- Wurde etwas nur „gerade so funktionsfähig" gebaut?
- Muss vereinfacht oder aufgeräumt werden, bevor es weitergeht?

Wenn die Basis wackelt, wird **nicht** erweitert.

---

## Phase 5 – Erst dann nächste Phase

Nur wenn die vorigen Schritte sauber genug sind, darf die nächste Ausbaustufe folgen.

---

## Verbindliche Reihenfolge im Projekt

### Stufe 1 – Basisstruktur

**Ziel:**

- Monorepo-Struktur
- Shared Types
- Shared Protocol
- Grunddokumentation
- Server-/Client-Trennung klarziehen

**Abnahmekriterien:**

- Verantwortung der Apps ist klar
- Eventstruktur ist grob definiert
- keine doppelte Typ- oder Eventlogik

---

### Stufe 2 – Lobby

**Ziel:**

- Host erstellt Raum
- Join-Code existiert
- Player kann beitreten
- Lobby synchronisiert live

**Abnahmekriterien:**

- mehrere Geräte können stabil beitreten
- Player erscheinen korrekt
- Verbindungsstatus ist nachvollziehbar

---

### Stufe 3 – Multiple Choice vollständig

**Ziel:**

- Host startet Frage
- Player antworten
- Server wertet aus
- Punkte werden berechnet
- Ergebnis wird angezeigt

**Abnahmekriterien:**

- eine Runde läuft sauber durch
- pro Spieler zählt nur eine Antwort
- Timer kommt vom Server
- Score ist nachvollziehbar

---

### Stufe 4 – Rangliste & Scoring

**Ziel:**

- Endscreen nach letzter Frage
- finale Rangliste anzeigen
- Scoreboard zwischen Fragen stabil
- Punktestand für alle Spieler korrekt

**Abnahmekriterien:**

- Rangliste nach jeder Runde korrekt
- Endscreen zeigt finale Platzierungen
- Scores stimmen mit Server-Berechnungen überein
- kein Zustand „Spiel hängt nach letzter Frage"

---

### Stufe 5 – Härten

**Ziel:**

- Reconnect
- ungültige Events abweisen
- doppelte Antworten ignorieren
- Host-Abbruch behandeln
- Statuskonsistenz verbessern

**Abnahmekriterien:**

- Fehlerfälle sind mitgedacht
- keine offensichtlichen Race-Conditions bleiben ungeprüft
- Eventfluss bleibt nachvollziehbar

---

### Stufe 6 – Erweiterungen

Erst danach dürfen Features wie diese geprüft werden:

- Buzzer
- Schätzfragen
- Teams
- Joker
- Quiz-Import
- Editor

Diese Features sind **kein Frühziel**.

---

## Regeln für Änderungen an Dateien

### Vor einer Dateiänderung prüfen

- Gehört diese Logik wirklich in diese Datei?
- Gibt es bereits einen Shared-Ort dafür?
- Wird hier UI und Geschäftslogik unnötig vermischt?
- Entsteht hier Dublette?

### Nach einer Dateiänderung prüfen

- Ist der Name noch passend?
- Ist die Datei klarer oder nur voller?
- Wurde Logik besser getrennt oder nur verschoben?
- Ist der Code verständlicher geworden?

---

## Regeln für neue Dateien

Neue Dateien nur anlegen, wenn sie einen klaren Zweck haben.

### Neue Datei ist sinnvoll, wenn

- ein klar eigener Verantwortungsbereich entsteht
- Wiederverwendung real ist
- Lesbarkeit verbessert wird
- Trennung von Host / Player / Server / Shared gestärkt wird

### Neue Datei ist nicht sinnvoll, wenn

- nur minimale Logik ausgelagert wird ohne echten Nutzen
- die Struktur künstlich aufgebläht wird
- ein Problem nur verschoben statt gelöst wird

---

## Event-Workflow

Bei jeder Änderung an Echtzeitlogik prüfen:

- Wer sendet das Event?
- Wer empfängt es?
- Wer validiert es?
- Welche Zustandsänderung löst es aus?
- Was passiert bei ungültigem oder verspätetem Event?
- Ist dokumentiert, wann das Event erlaubt ist?

Wenn diese Fragen nicht beantwortbar sind, ist die Lösung unklar.

---

## Review-Checkliste pro Phase

### Architektur

- server authoritative?
- klare Trennung der Zuständigkeiten?
- keine verdoppelte Logik?
- kein unnötiger Overhead?

### Kommunikation

- Events klar benannt?
- Payloads typisiert?
- validiert?
- dokumentiert?

### UX

- Hostscreen klar?
- Player UI mobil nutzbar?
- Zustände verständlich?
- kein unnötiger UI-Ballast?

### Stabilität

- doppelte Antworten abgefangen?
- invalide Zustände abgefangen?
- Reconnect mitgedacht?
- Timer nicht clientseitig als Wahrheit?

---

## Was ein Agent aktiv vermeiden soll

- Scope inflation
- voreilige Erweiterbarkeit um jeden Preis
- kosmetische Arbeit statt Kernstabilität
- große Refactors ohne zwingenden Grund
- drei halbfertige Systeme statt eines sauberen
- spontane Zusatzfeatures
- unklare Zustandslogik
- „erstmal schnell direkt in die UI bauen"

---

## Kommunikationsstil des Agents

Der Agent soll klar benennen:

- was er baut
- warum er es so baut
- was daran riskant ist
- was bewusst verschoben wird
- wo die aktuelle Lösung noch schwach ist

Nicht erwünscht:

- Schönreden
- Marketingformulierungen
- Fortschritt simulieren
- halbfertige Lösungen als solide darstellen

---

## Dokumentationsworkflow

Bei strukturellen Änderungen prüfen, ob folgende Dateien angepasst werden müssen:

- `README.md`
- `docs/CONCEPT.md`
- `docs/architecture.md`
- `docs/GAME-RULES.md`
- `docs/IMPLEMENTATION.md`
- `docs/CONSTRAINTS.md`

Wenn Code und Doku auseinanderlaufen, ist das ein Wartungsfehler.

---

## Eskalationsregel

Wenn ein Agent merkt, dass eine Aufgabe eigentlich:

- zu groß ist
- mehrere Phasen vermischt
- neue Architektur erzwingt
- oder zu viel Risiko auf einmal erzeugt

dann muss er die Aufgabe in kleinere, kontrollierbare Schritte zerlegen.

Nicht trotzdem durchdrücken.

---

## Schlussregel

Wenn unklar ist, ob ein weiterer Ausbau schon sinnvoll ist, gilt:

**erst stabilisieren, dann erweitern.**
