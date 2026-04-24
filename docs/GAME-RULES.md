# Spielregeln fuer den Quiz-Abend

## Ziel

Ein Host fuehrt ein simples Multiple-Choice-Quiz durch.

- Der Hauptscreen zeigt Frage, Aufloesung und Rangliste.
- Die Handys der Spieler dienen nur fuer Join, Antwort und Status.
- Der Server entscheidet, was gueltig ist.

## Rundenablauf

1. Host startet das Spiel.
2. Der Server oeffnet die naechste Frage.
3. Host und Player sehen dieselbe Frage.
4. Der Timer laeuft serverseitig.
5. Jeder Spieler kann eine Antwort absenden.
6. Nach Timerende oder wenn alle geantwortet haben, wird die Frage geschlossen.
7. Die richtige Antwort wird gezeigt.
8. Spieler sehen, ob ihre Antwort richtig war und wie viele Punkte diese Frage gebracht hat.
9. Der Punktestand wird aktualisiert.
10. Alle verbundenen Spieler druecken auf dem Handy "Bereit fuer naechste Frage".
11. Der Server startet automatisch die naechste Frage oder beendet das Spiel.

## Punkte

Aktuell gilt fuer Multiple Choice:

- richtige Antwort = Punkte der Frage
- falsche Antwort = `0`
- keine Antwort = `0`
- keine Geschwindigkeitsboni
- keine Multiplikatoren

Im mitgelieferten Standard-Quiz sind die Fragen derzeit schlicht und fest bepunktet.

## Antwortregeln

- Pro Spieler zaehlt pro Frage nur eine gueltige Antwort.
- Die erste gueltige Antwort gewinnt.
- Doppelte Antworten duerfen den Score nicht veraendern.
- Spaete Antworten nach `question:close` zaehlen nicht.
- Der Client darf Feedback zeigen, aber nicht selbst ueber Gueltigkeit entscheiden.

## Timer-Regel

- Der Timer kommt vom Server.
- Die Antwortzeit pro Frage betraegt aktuell `60s`.
- Clients zeigen nur den verbleibenden Stand an.
- Nicht der letzte sichtbare Tick, sondern die serverseitige Sperre ist massgeblich.

## Rollen

### Host

Der Host:

- erstellt den Raum
- startet das Spiel
- sieht den Join-Code und QR
- sieht Status, Fortschritt und Spieler in einer dauerhaften Uebersicht
- kann Kategorien fuer den Host-Flow vorbereiten, ohne dass daraus schon serverseitige Regeln behauptet werden
- sieht den Fortschritt der Antworten
- sieht, wie viele Spieler fuer die naechste Frage bereit sind
- sieht Endstand und kann den Raum schliessen

### Spieler

Die Spieler:

- treten per Code oder QR bei
- geben einen Namen ein
- senden eine Antwort pro Frage
- sehen, ob die Antwort angenommen wurde
- sehen bei der Aufloesung richtig/falsch, Punkte fuer die Frage, Rangliste und Endstand
- starten die naechste Frage gemeinsam ueber "Bereit fuer naechste Frage"

## UI-Fokus

### Hauptscreen

- Frage gross und lesbar
- Timer klar sichtbar
- Rangliste einfach zu erfassen
- Status, Fortschritt und Spieleruebersicht bleiben klar gegliedert
- kein ueberladenes Layout

### Handy

- grosse Buttons
- moeglichst kein Scrollen im Kernfluss
- klare Rueckmeldung nach dem Absenden
- wenig Ablenkung

## Unterbrechungen

- Kurze Disconnects sind abzufangen, aber keine Kernmechanik.
- Wer mitten im Spiel neu laedt, bekommt wieder einen praktischen Snapshot fuer den aktuellen Stand, aber keine perfekte Recovery-Magie.
- Fuer den Abend ist stabile Verbindung wichtiger als ausgefeilte Recovery-Logik.

## Was ausdruecklich nicht Teil dieses Spiels ist

- Schaetzfragen
- Buzzer
- Teams
- Joker
- Accounts
- Profile
- Chat
- Editor- oder Import-Workflow waehrend des Spiels
- Persistenz ueber den Abend hinaus

## Schluss

Dieses Spiel soll klar und stressfrei funktionieren.

Lieber ein einfacher, sauberer Multiple-Choice-Abend als ein ueberladenes Quiz mit halbfertigen Sonderregeln.
