# Spielregeln fuer den Quiz-Abend

## Ziel

Ein Host fuehrt ein simples Quiz mit den vorbereiteten Fragetypen durch. Das oeffentliche Bild laeuft getrennt auf dem Display/TV.

- Das Display/TV zeigt Lobby, Frage, Aufloesung und Rangliste.
- Der Host-Controller steuert Start, Einstellungen und Fallbacks.
- Die Handys der Spieler dienen nur fuer Join, Antwort und Status.
- Der Server entscheidet, was gueltig ist.

## Spielplaene

Vor dem Start waehlt der Host einen Spielplan. Der Server validiert diesen Spielplan und erstellt daraus den tatsaechlichen Fragenpool.

Verfuegbar sind Presets fuer kurze Partyrunden, normalen Abendmodus, langen Quizabend und Chaos-/Party-Modus. Zusaetzlich gibt es eine freie Auswahl mit Fragenanzahl, Kategorien, Fragetypen, Timer, Reveal-Dauer, Antworttexten auf Handys, Demo-Frage und Display-Show-Level.

Wichtig: Kategorien und Fragetypen sind echte Serverfilter. Wenn eine Auswahl zu wenige Fragen ergibt, startet das Spiel nicht und der Host bekommt eine konkrete Fehlermeldung mit verfuegbarer und benoetigter Anzahl.

## Rundenablauf

1. Host waehlt Preset oder freie Auswahl und startet das Spiel.
2. Der Server validiert den Spielplan und erstellt den Fragenpool.
3. Optional laeuft zuerst eine Demo-Frage ohne Punkte.
4. Der Server oeffnet die naechste Frage, bei hohem Show-Level mit kurzem Countdown.
5. Das Display/TV zeigt die vollstaendige Frage; der Host sieht Kontrolldaten; Player sehen nur den Antwort-Controller.
6. Der Timer laeuft serverseitig, standardmaessig 90 Sekunden.
7. Jeder Spieler kann eine Antwort absenden.
8. Nach Timerende, Host-Override oder wenn alle geantwortet haben, wird die Frage geschlossen.
9. Die richtige Antwort wird gezeigt.
10. Spieler sehen, ob ihre Antwort richtig war und wie viele Punkte diese Frage gebracht hat.
11. Alle verbundenen Spieler druecken auf dem Handy "Bereit fuer naechste Frage".
12. Normalerweise startet danach direkt die naechste Frage.
13. Nach jeder 5. echten Frage zeigt der Server den Zwischenstand; nach der letzten Frage erscheint der Endstand.
14. Falls Spieler haengen bleiben, kann der Host manuell weiterschalten oder das Spiel mit aktuellem Stand beenden.

## Punkte

Aktuell gilt:

- richtige Antwort = Punkte der Frage
- falsche Antwort = `0`
- keine Antwort = `0`
- keine Geschwindigkeitsboni
- keine Multiplikatoren
- Demo-Fragen zaehlen nicht in die Punkte

Bei Schaetzfragen bekommt die naechste Antwort die Punkte. Bei Mehrheitsfragen bekommen alle Punkte, die eine meistgewaehlte Option getroffen haben; bei Gleichstand zaehlen alle Top-Optionen.

Ranking-Fragen koennen im Spielplan strikt oder partyfreundlich gewertet werden. Im partyfreundlichen Modus gibt es einen Punkt pro Item an exakt richtiger Position und einen Bonuspunkt fuer komplett richtige Reihenfolge. Die Reveal-Ansicht zeigt die Details, damit Teilpunkte nachvollziehbar bleiben.

Freitextfragen sind in den Standard-Spielplaenen deaktiviert oder niedrig dosiert. Wenn sie aktiv sind, zaehlen normalisierte Uebereinstimmungen mit der hinterlegten Antwort oder einem Alias.

Im mitgelieferten Standard-Quiz sind die Fragen fest bepunktet. Fuer den Abend wird eine Auswahl aus dem kombinierten JSON-Fragenpool gespielt, gefiltert nach dem finalen Spielplan.

## Antwortregeln

- Pro Spieler zaehlt pro Frage nur eine gueltige Antwort.
- Die erste gueltige Antwort gewinnt.
- Doppelte Antworten duerfen den Score nicht veraendern.
- Spaete Antworten nach `question:close` zaehlen nicht.
- Antworten muessen zum aktiven Fragetyp passen.
- Der Client darf Feedback zeigen, aber nicht selbst ueber Gueltigkeit entscheiden.

## Timer-Regel

- Der Timer kommt vom Server.
- Die Antwortzeit kommt aus dem validierten Spielplan und ist standardmaessig 90 Sekunden.
- Clients zeigen nur den verbleibenden Stand an.
- Nicht der letzte sichtbare Tick, sondern die serverseitige Sperre ist massgeblich.

## Rollen

### Display/TV

Das Display/TV:

- erstellt den primaeren Raum
- zeigt Host- und Player-QRs
- zeigt Join-Code und Lobby fuer den Raum
- zeigt Fragen gross und lesbar
- zeigt Aufloesung, Rangliste und Endstand
- entscheidet keine Spielwahrheit

### Host

Der Host:

- koppelt sich per Host-QR oder Host-Token mit dem Display-Raum
- waehlt vor Spielstart Preset oder freie Auswahl
- sieht den vom Server gelieferten Fragenkatalog als Grundlage fuer Kategorien und Fragetypen
- startet das Spiel mit finalem Spielplan
- sieht den Join-Code und Status
- sieht Status, Fortschritt und Spieler in einer dauerhaften Uebersicht
- sieht den aktuell gewaehlten Spielplan, aktive Kategorien und aktive Fragetypen
- sieht den Fortschritt der Antworten
- sieht, wie viele Spieler fuer die naechste Frage bereit sind
- entscheidet im Spielplan, ob Antworttexte auf Handys sichtbar sein sollen
- kann eine Frage sofort schliessen, im Reveal weitergehen, optional den Zwischenstand anzeigen, Spieler entfernen oder das Spiel mit aktuellem Stand beenden
- sieht Endstand und kann den Raum schliessen

### Spieler

Die Spieler:

- treten per Code oder QR bei
- geben einen Namen ein
- schauen waehrend aktiver Fragen auf den Host-Bildschirm
- senden eine Antwort pro Frage
- sehen, ob die Antwort angenommen wurde
- sehen bei der Aufloesung richtig/falsch, Punkte fuer die Frage, bei faelligen Zwischenstaenden die Rangliste und am Schluss den Endstand
- starten die naechste Frage gemeinsam ueber "Bereit fuer naechste Frage"

## UI-Fokus

### Display/TV

- Frage gross und lesbar
- bei hohem Show-Level kurzer Countdown vor Fragen
- Antwortoptionen beziehungsweise Ranking-Items mit Text klar sichtbar
- Timer klar sichtbar
- Antwortfortschritt mit Anzahl beantwortet/offen
- Reveal mit deutlicher richtiger Antwort, abgedunkelten falschen Optionen und Erklaerung
- Rangliste alle 5 echten Fragen einfach zu erfassen
- Top 3 und Endstand als Abschluss klar hervorgehoben
- Status, Fortschritt und Spieleruebersicht bleiben klar gegliedert
- kein ueberladenes Layout

### Host-Controller

- klare Steuerung fuer Start, Einstellungen und Fallbacks
- Fortschritt und Verbindungsstatus jederzeit sichtbar
- keine ablenkende Praesentationsrolle

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
