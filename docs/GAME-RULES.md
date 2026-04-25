# Spielregeln fuer den Quiz-Abend

## Ziel

Ein Host fuehrt ein simples Quiz mit den vorbereiteten Fragetypen durch.

- Der Hauptscreen zeigt Frage, Aufloesung und Rangliste.
- Die Handys der Spieler dienen nur fuer Join, Antwort und Status.
- Der Server entscheidet, was gueltig ist.

## Rundenablauf

1. Host startet das Spiel.
2. Der Server oeffnet die naechste Frage.
3. Der Host zeigt die vollstaendige Frage; Player sehen nur den Antwort-Controller.
4. Der Timer laeuft serverseitig.
5. Jeder Spieler kann eine Antwort absenden.
6. Nach Timerende oder wenn alle geantwortet haben, wird die Frage geschlossen.
7. Die richtige Antwort wird gezeigt.
8. Spieler sehen, ob ihre Antwort richtig war und wie viele Punkte diese Frage gebracht hat.
9. Der Punktestand wird aktualisiert.
10. Alle verbundenen Spieler druecken auf dem Handy "Bereit fuer naechste Frage".
11. Der Server startet automatisch die naechste Frage oder beendet das Spiel.
12. Falls Spieler haengen bleiben, kann der Host auf der Rangliste manuell weiterschalten.

## Punkte

Aktuell gilt:

- richtige Antwort = Punkte der Frage
- falsche Antwort = `0`
- keine Antwort = `0`
- keine Geschwindigkeitsboni
- keine Multiplikatoren

Bei Schaetzfragen bekommt die naechste Antwort die Punkte. Bei Mehrheitsfragen bekommen alle Punkte, die eine meistgewaehlte Option getroffen haben; bei Gleichstand zaehlen alle Top-Optionen. Ranking-Fragen zaehlen nur bei exakt richtiger Reihenfolge. Freitextfragen zaehlen bei normalisiert exakter Uebereinstimmung mit der hinterlegten Antwort oder einem Alias.

Im mitgelieferten Standard-Quiz sind die Fragen fest bepunktet. Fuer den Abend wird eine Auswahl aus dem kombinierten JSON-Fragenpool gespielt.

## Antwortregeln

- Pro Spieler zaehlt pro Frage nur eine gueltige Antwort.
- Die erste gueltige Antwort gewinnt.
- Doppelte Antworten duerfen den Score nicht veraendern.
- Spaete Antworten nach `question:close` zaehlen nicht.
- Antworten muessen zum aktiven Fragetyp passen.
- Der Client darf Feedback zeigen, aber nicht selbst ueber Gueltigkeit entscheiden.

## Timer-Regel

- Der Timer kommt vom Server.
- Die Antwortzeit kommt aus der vorbereiteten Frage.
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
- entscheidet in der Lobby, ob Antworttexte auf Handys sichtbar sein sollen
- sieht Endstand und kann den Raum schliessen

### Spieler

Die Spieler:

- treten per Code oder QR bei
- geben einen Namen ein
- schauen waehrend aktiver Fragen auf den Host-Bildschirm
- senden eine Antwort pro Frage
- sehen, ob die Antwort angenommen wurde
- sehen bei der Aufloesung richtig/falsch, Punkte fuer die Frage, Rangliste und Endstand
- starten die naechste Frage gemeinsam ueber "Bereit fuer naechste Frage"

## UI-Fokus

### Hauptscreen

- Frage gross und lesbar
- Antwortoptionen beziehungsweise Ranking-Items mit Text klar sichtbar
- Timer klar sichtbar
- Rangliste einfach zu erfassen
- Status, Fortschritt und Spieleruebersicht bleiben klar gegliedert
- kein ueberladenes Layout

### Handy

- grosse Buttons
- waehrend aktiver Fragen kein vollstaendiger Fragetext
- Antworttexte nur, wenn der Host sie bewusst in der Lobby einschaltet
- moeglichst kein Scrollen im Kernfluss
- klare Rueckmeldung nach dem Absenden
- wenig Ablenkung

## Unterbrechungen

- Kurze Disconnects sind abzufangen, aber keine Kernmechanik.
- Wer mitten im Spiel neu laedt, bekommt wieder einen praktischen Snapshot fuer den aktuellen Stand, aber keine perfekte Recovery-Magie.
- Fuer den Abend ist stabile Verbindung wichtiger als ausgefeilte Recovery-Logik.

## Was ausdruecklich nicht Teil dieses Spiels ist

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

Lieber ein einfacher, sauberer Abend mit den vorbereiteten Fragetypen als ein ueberladenes Quiz mit halbfertigen Sonderregeln.
