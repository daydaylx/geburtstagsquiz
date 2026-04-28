# Fragenkatalog-Audit

## Kurzfazit

Der Katalog ist spielbar und hat viele starke Millennial-/Nostalgiefragen, aber er ist noch nicht abendfest. Die groessten Risiken sind nicht Architektur, sondern Datenqualitaet: ueberschriebene Roh-IDs, doppelte Option-IDs, fehlende Explanations, subjektive Rankings und mehrere faktisch oder semantisch wackelige Fragen. Die 18+-Kategorie ist in Teilen deutlich zu grafisch, entwertend oder mit Minderjaehrigen-Kontexten vermischt und sollte vor einem privaten Event hart gekuerzt werden. Wenn die priorisierten Punkte unten bereinigt sind, bleibt ein guter Kern mit deutlich besserer Party-Tauglichkeit.

## Statistik

- Gepruefte Fragen: 520 spielbare Fragen aus `getDefaultQuiz()`; Rohdaten: 564 Fragen, 520 eindeutige IDs
- Gepruefte ID-Bereiche:
  - Batch 1: 1-65 (`q-01-01-6a920e98bc` bis `q-03-11-75e907ba1d`)
  - Batch 2: 66-130 (`q-03-12-7692bfe976` bis `q-05-19-3c5b30cb20`)
  - Batch 3: 131-195 (`q-05-20-530d8c8719` bis `q-07-e04-4073853fbd`)
  - Batch 4: 196-260 (`q-07-mdb25573919` bis `q-10-06-65bfbcc6d2`)
  - Batch 5: 261-325 (`q-10-07-c46b85b036` bis `q-02-new-18-frottage`)
  - Batch 6: 326-390 (`q-02-new-19-swinging` bis `q-05-05`)
  - Batch 7: 391-455 (`q-05-06` bis `q-07-20`)
  - Batch 8: 456-520 (`q-07-21` bis `q-10-15`)
- Technische Fehler: 68 konkrete Datenfehler (44 ueberschriebene Roh-ID-Dubletten, 18 doppelte Option-IDs, 2 fehlende Explanations, 2 Open-Text-Fragen ohne Aliases, 2 Multiple-Choice-Fragen mit nur 2 Optionen)
- Inhaltliche Probleme: 67 konkrete Einzelfunde, davon 24 hoch priorisiert
- Doppelte/aehnliche Fragen: 18 Inhaltscluster plus 44 Roh-ID-Ueberschreibungen
- Uebersprungene IDs: Keine

## Kritische Fragen (falsch/uneindeutig/problematisch)

- `ID: q-04-12-a015ede7fc` (`geburtstagsquiz_millennials_engine_v4_release_candidate.json:2966`) -> Problem: Prompt beschreibt klar `Joe Millionaire` ("Junggeselle, der gar nicht so reich war"), richtige Antwort ist aber `Der Bachelor`.
- `ID: q-04-07-2a1f4b82bc` (`geburtstagsquiz_millennials_engine_v4_release_candidate.json:2806`) -> Problem: Fragt nach einem Talkshow-Moderator, korrekte Antwort ist aber Andreas aus `Frauentausch`; Kategorie/Prompt sind falsch.
- `ID: q-03-08` (`geburtstagsquiz_millennials_engine_v5_expanded.json:3432`) -> Problem: ICQ-Invisible-Frage ignoriert die historische Visible-List; "Niemand" ist als eindeutige richtige Antwort falsch bzw. mindestens pruefbeduerftig.
- `ID: q-01-10` (`geburtstagsquiz_millennials_engine_v5_expanded.json:344`) -> Problem: Snapes `Asphodel/Wormwood`-Deutung wird als Fakt verkauft, ist aber eher Fan-/Interpretationswissen und fuer Filmquiz schwer belegbar.
- `ID: q-05-12` (`geburtstagsquiz_millennials_engine_v5_expanded.json:4698`) -> Problem: Ranking nach "Millennial-Wahrscheinlichkeit" ist subjektiv; Ranking-Fragen brauchen eine objektive Reihenfolge.
- `ID: q-07-11` (`geburtstagsquiz_millennials_engine_v5_expanded.json:6159`) -> Problem: Snake-Geometrie ist ohne Schlangenlaenge und aktuelle Koerperform unterbestimmt.
- `ID: q-07-17` (`geburtstagsquiz_millennials_engine_v5_expanded.json:6328`) -> Problem: Ranking nach "Rechenpower (Bits)" mischt echte Architektur und Marketing-Bit-Angaben; PS2 als "128-bit" ist umstritten/unsauber.
- `ID: q-09-18` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7510`) und `ID: q-05-e01-17bf04c35b` (`geburtstagsquiz_millennials_engine_v4_release_candidate.json:4273`) -> Problem: Beide fragen Bierkonsum 2022, liefern aber unterschiedliche Werte (91,8 l vs. 87,2 l).
- `ID: q-09-19` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7522`) -> Problem: Prompt fragt nach Fleischsorten, eines der Items ist Kaese; inhaltliche Kategorie passt nicht.
- `ID: q-09-10` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7376`) -> Problem: "aktuell im Durchschnitt" fuer Bierkastenpreis ist volatil und ohne Region/Datum nicht robust.
- `ID: q-10-13` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7816`) -> Problem: CorrectText behauptet dauerhafte Farbfehler durch Magnete; Explanation relativiert mit Degauss. Antwort ist zu absolut.
- `ID: q-10-14` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7830`) -> Problem: Ranking von Eingabemethoden nach Tippgeschwindigkeit ist nutzerabhaengig und hat keine Explanation.
- `ID: q-05-24` (`geburtstagsquiz_millennials_engine_v5_expanded.json:5066`) -> Problem: "1 Liter Wasserverlust durch 50 g Alkohol" ist medizinisch/faktisch wackelig und ohne Quelle riskant.
- `ID: q-07-05` (`geburtstagsquiz_millennials_engine_v5_expanded.json:5996`) -> Problem: Handheld-Gewichts-Ranking sagt nicht klar, ob mit oder ohne Batterien gewertet wird; dadurch kann Game Gear vs. Lynx kippen.
- `ID: q-04-24-97d8e651ce` (`geburtstagsquiz_millennials_engine_v4_release_candidate.json:3350`) -> Problem: 9Live hatte mehrere Nacht-/Call-in-Formate; `quiz fire` ist als einzige Antwort zu eng und "mussten anrufen" ist schief formuliert.

## Schlechte Formulierungen / Schwache Optionen

- `ID: q-07-01-0c637ee4c1`, `q-07-02-e9bfa106f6`, `q-07-03-318ac3d650`, `q-07-04-5a7daee1ee`, `q-07-06-259485ee09`, `q-07-08-c7db983b5b`, `q-07-09-aef9b7b2b3`, `q-07-10-db40f9e03c`, `q-07-11-b38e1360c1`, `q-07-12-4d0ca5ac04`, `q-07-13-8ba183d620`, `q-07-15-7600cc63d8`, `q-07-18-fa5a993568`, `q-07-19-4738126552`, `q-07-20-d840db0acf`, `q-07-21-dcb4598b78`, `q-07-24-b021710fea`, `q-07-25-a7b458cf6c` (`geburtstagsquiz_millennials_engine_v4_release_candidate.json:5193` bis `6657`) -> Problem: Doppelte Option-IDs innerhalb der Frage; technisch riskant fuer Antwortauswertung und UI.
- `ID: q-07-25-a7b458cf6c` (`geburtstagsquiz_millennials_engine_v4_release_candidate.json:6657`) -> Problem: Tippfehler "Russen" statt vermutlich "Rennen"; Explanation ist ein Datenbank-Kommentar, keine Spieler-Erklaerung.
- `ID: q-07-22` (`geburtstagsquiz_millennials_engine_v5_expanded.json:6461`) -> Problem: Tippfehler "fraf" statt "frass/fraß".
- `ID: q-01-01` (`geburtstagsquiz_millennials_engine_v5_expanded.json:84`) -> Problem: Tippfehler "zusammenfassst".
- `ID: q-01-18-3959fe77b5` (`geburtstagsquiz_millennials_engine_v4_release_candidate.json:532`) -> Problem: Korrekte Option ist ein abgebrochener Halbsatz und als MC-Antwort unnatuerlich lang/unklar.
- `ID: q-02-15-23bfa11944` (`geburtstagsquiz_millennials_engine_v5_expanded.json:1225`) -> Problem: Catfishing-Explanation nutzt Koerper-/Alters-Shaming statt neutraler Definition.
- `ID: q-02-20-61e1d822ed` (`geburtstagsquiz_millennials_engine_v5_expanded.json:1385`) -> Problem: Explanation zieht einen parteipolitischen Seitenhieb; fuer Partyquiz unnoetig polarisierend.
- `ID: q-03-23-681bfb03e4` (`geburtstagsquiz_millennials_engine_v4_release_candidate.json:2426`) -> Problem: `Ditz/Ditzer` ist sehr regional und als allgemeine Millennial-Frage unfair.
- `ID: q-05-11-a587148d2a` (`geburtstagsquiz_millennials_engine_v4_release_candidate.json:3793`) -> Problem: Explanation nennt eine rassistische historische Bezeichnung; sollte ersatzlos raus.
- `ID: q-05-19-3c5b30cb20` (`geburtstagsquiz_millennials_engine_v4_release_candidate.json:4049`) -> Problem: "Diabetes"-Joke und "Geiler Scheiss" sind unnoetig vulgaer/medizinisch unsensibel.
- `ID: q-06-04-09a502d726` (`geburtstagsquiz_millennials_engine_v4_release_candidate.json:4437`) -> Problem: Klimawandel-Punchline ist fuer eine Klingeltonfrage unangemessen hart.
- `ID: q-06-13-ef29db8405` (`geburtstagsquiz_millennials_engine_v4_release_candidate.json:4725`) -> Problem: "Paparazzi-Skandal" passt nicht zur Antwort "Ehegeloebnis-Erneuerung"; Frage wirkt konstruiert.
- `ID: q-06-25` (`geburtstagsquiz_millennials_engine_v5_expanded.json:5843`) -> Problem: Tippfehler "Tasgeld".
- `ID: q-08-14` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7143`) -> Problem: "kaum Englisch konnte" ist als Personenbehauptung zu grob; besser neutral als "Lyrics klangen wichtiger als Sinn".
- `ID: q-09-16` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7486`) -> Problem: "die restlichen 15% luegen" ist schwach und nicht erklaerend.

## Fehlende oder schwache Explanations

- `ID: q-10-04` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7694`) -> Problem: Explanation fehlt komplett; Ranking braucht Kontext zur Reihenfolge.
- `ID: q-10-14` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7830`) -> Problem: Explanation fehlt komplett; Reihenfolge ist ohnehin subjektiv.
- `ID: q-09-12` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7419`) -> Problem: Open-Text ohne Aliases; "ELSTER", "ELektronische STeuerERklaerung" und Schreibvarianten fehlen.
- `ID: q-09-21` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7549`) -> Problem: Open-Text ohne Aliases; "FI", "RCD", "Fehlerstromschutzschalter" fehlen.
- `ID: q-01-22` (`geburtstagsquiz_millennials_engine_v5_expanded.json:675`) -> Problem: Explanation zitiert eine vulgaere Beleidigung; fuer den Reveal vermeidbar.
- `ID: q-04-04-ranking-starts` (`geburtstagsquiz_millennials_engine_v5_expanded.json:3728`) -> Problem: "kollektive Verbloedung" ist kein Erklaerwert und wertet Spielerinteressen ab.
- `ID: q-05-03` (`geburtstagsquiz_millennials_engine_v5_expanded.json:4442`) -> Problem: "Diabetes im Glas" ist ein medizinischer Punchline statt sachlicher Zucker-Kontext.
- `ID: q-09-01` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7208`) -> Problem: "Haushaltsstudie von 2022" wird nicht nachvollziehbar benannt; als Schaetzwert pruefbeduerftig.
- `ID: q-09-08` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7333`) -> Problem: Vage "Umfrage von 2021"; keine Zielgruppe/Quelle.
- `ID: q-09-14` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7443`) -> Problem: GDV-Wert wird behauptet, Explanation erklaert aber nur mit Witz statt Einordnung.
- `ID: q-09-20` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7537`) -> Problem: Top-10-Prozent-Nettoeinkommen ist zeit- und haushaltsdefinitionsabhaengig; Explanation hat keine Quelle.
- `ID: q-09-22` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7558`) -> Problem: Prozentwert zu Zimmerpflanzen ist ohne Grundgesamtheit/Quelle beliebig.
- `ID: q-10-06` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7723`) -> Problem: 92%-Wert zu Tauschboersen-Fakes hat keine belastbare Quelle.
- `ID: q-10-15` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7844`) -> Problem: 89%-Wert zu Phantom-Vibrationen ist ohne Studie/Grundgesamtheit zu absolut.

## Fragen zum Entfernen

- `ID: q-02-new-03-glory-hole` (`geburtstagsquiz_millennials_engine_v5_expanded.json:1705`) -> Begruendung: Dehumanisierende/zu explizite Explanation; besser nicht als Partyfrage.
- `ID: q-02-new-05-teabagging` (`geburtstagsquiz_millennials_engine_v5_expanded.json:1769`) -> Begruendung: Verknuepft 12-jaehrige Spieler mit realer Sexualpraktik; entfernen.
- `ID: q-02-new-07-bukkake` (`geburtstagsquiz_millennials_engine_v5_expanded.json:1833`) -> Begruendung: Grafische Ejakulationsfrage; fuer erlaubte 18+-Definition zu schockig.
- `ID: q-02-new-09-fisting` (`geburtstagsquiz_millennials_engine_v5_expanded.json:1897`) -> Begruendung: Grafische Anatomie plus entwertende Analogie; entfernen.
- `ID: q-02-new-11-snowballing` (`geburtstagsquiz_millennials_engine_v5_expanded.json:1961`) -> Begruendung: Koerperfluessigkeits-/Ekelhumor dominiert die Frage.
- `ID: q-02-new-12-spitroast` (`geburtstagsquiz_millennials_engine_v5_expanded.json:1993`) -> Begruendung: Grafische Mehrpersonen-Penetration; partyuntauglich.
- `ID: q-02-new-13-pearl-necklace` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2025`) -> Begruendung: Grafisch und nicht noetig fuer den Fragenmix.
- `ID: q-02-new-16-squirting` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2121`) -> Begruendung: Objektifizierende Explanation, faktisch sensibler Bereich.
- `ID: q-02-new-17-docking` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2153`) -> Begruendung: Sehr explizite Genitalbeschreibung ohne spielerischen Mehrwert.
- `ID: q-02-new-18-frottage` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2185`) -> Begruendung: Sexualisierte Erinnerung an 15-Jaehrige; entfernen.
- `ID: q-02-new-20-dogging` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2249`) -> Begruendung: Oeffentliche sexuelle Handlungen plus Anzeige-Kontext; besser streichen.
- `ID: q-02-new-21-eiffel-tower` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2281`) -> Begruendung: Grafische Dreier-Beschreibung; entfernen.
- `ID: q-02-new-22-atm` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2313`) -> Begruendung: Grafisch, Ekel-/Krankheitsfokus; entfernen.
- `ID: q-02-new-28-golden-shower` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2505`) -> Begruendung: Urin-/Ekelhumor statt sachlicher Definition.
- `ID: q-02-new-29-sounding` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2537`) -> Begruendung: Medizinisch riskante Praktik; trotz Warnung zu nah an Anleitung.
- `ID: q-02-new-30-figging` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2569`) -> Begruendung: Schmerz-/Bestrafungskontext; unangenehm und nicht partygeeignet.
- `ID: q-02-new-31-cbt` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2601`) -> Begruendung: Genitalfolter/Schmerz als Witz; entfernen.
- `ID: q-02-new-32-creampie` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2633`) -> Begruendung: Grafische Ejakulationsfrage; entfernen.
- `ID: q-02-new-33-milf` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2665`) -> Begruendung: Explanation bringt 14-jaehrige in sexualisierten Voicechat-Kontext; entfernen.
- `ID: q-02-new-41-blue-balls` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2921`) -> Begruendung: 16-jaehrige und sexuelle Erpressung als "Klassiker"; entfernen.
- `ID: q-02-new-43-gag-reflex` (`geburtstagsquiz_millennials_engine_v5_expanded.json:2985`) -> Begruendung: Oralsex-/Erstickungsbeschreibung ist zu grafisch fuer Partyquiz.
- `ID: q-02-new-44-roleplay` (`geburtstagsquiz_millennials_engine_v5_expanded.json:3017`) -> Begruendung: Beispiele `Lehrer/Schueler` riskieren Minderjaehrigen-Assoziation; entfernen oder komplett neu bauen.
- `ID: q-10-01` (`geburtstagsquiz_millennials_engine_v5_expanded.json:7652`) -> Begruendung: 14-jaehrige Person plus Nacktbilder-Suche; klare Minderjaehrigen-/Sexualisierungskollision.

## Fragen zur Verbesserung (konkrete Vorschlaege)

- ID: `q-04-12-a015ede7fc`
  Problem: Prompt beschreibt `Joe Millionaire`, Antwort ist `Der Bachelor`.
  Vorschlag: Auf `Joe Millionaire` drehen.
  Neue Formulierung: "In welcher Reality-Show dateten Frauen einen angeblichen Millionaer, der in Wahrheit gar nicht reich war?"
  Neue Optionen: `Joe Millionaire`; `Der Bachelor`; `Temptation Island`; `Beauty and the Nerd`
  Richtige Antwort: `Joe Millionaire`
  Explanation: "Bei `Joe Millionaire` war genau die vorgetaeuschte Millionaersrolle der Twist. `Der Bachelor` verteilt Rosen, aber behauptet nicht automatisch, reich zu sein."
  Prioritaet: hoch

- ID: `q-04-07-2a1f4b82bc`
  Problem: Fragt nach Talkshow-Moderator, Antwort ist Scripted-Reality-Kandidat.
  Vorschlag: Prompt auf Meme-Zitat korrigieren.
  Neue Formulierung: "Aus welcher deutschen TV-Sendung stammt das Meme-Zitat `Halt Stop!` von Andreas?"
  Neue Optionen: `Frauentausch`; `Richter Alexander Hold`; `Oliver Geissen`; `Hans Meiser`
  Richtige Antwort: `Frauentausch`
  Explanation: "Das Zitat stammt aus einer `Frauentausch`-Folge mit Andreas und wurde spaeter zum Internet-Meme."
  Prioritaet: hoch

- ID: `q-03-08`
  Problem: ICQ-Invisible-Antwort ignoriert Visible-List.
  Vorschlag: Frage auf die Ausnahme zuspitzen.
  Neue Formulierung: "Wer konnte dich bei ICQ trotz `Invisible`-Status weiterhin online sehen?"
  Neue Optionen: `Kontakte auf deiner Visible-List`; `alle mit niedriger ICQ-Nummer`; `nur Top-Kontakte`; `niemand jemals`
  Richtige Antwort: `Kontakte auf deiner Visible-List`
  Explanation: "ICQ kannte Sichtbarkeitslisten: Bestimmte Kontakte konnten dich trotz Invisible-Status sehen."
  Prioritaet: hoch

- ID: `q-05-12`
  Problem: Subjektives Ranking wird als objektive Ranking-Frage gespielt.
  Vorschlag: Zu Majority-Guess machen.
  Neue Formulierung: "Wo ist man nach einer harten Party am wahrscheinlichsten aufgewacht?"
  Neue Optionen: `Couch`; `Badewanne`; `unter dem Kuechentisch`; `fremdes Gartenhaus`
  Richtige Antwort: Mehrheit entscheidet
  Explanation: "Das ist Erfahrungs- und Gruppendynamik, keine objektiv sortierbare Wahrheit."
  Prioritaet: hoch

- ID: `q-07-11`
  Problem: Snake-Logik ist ohne Ausgangslage nicht eindeutig.
  Vorschlag: Durch klare Tetromino-/Minesweeper-Logik ersetzen oder genaue Snake-Skizze liefern.
  Neue Formulierung: "Minesweeper: Ein Feld zeigt eine `3` und hat genau drei ungeoeffnete Nachbarn. Was folgt logisch?"
  Neue Optionen: `Alle drei sind Minen`; `genau eine ist eine Mine`; `keine ist eine Mine`; `es ist nicht entscheidbar`
  Richtige Antwort: `Alle drei sind Minen`
  Explanation: "Die Zahl gibt die Minen in den Nachbarfeldern an. Wenn nur drei Felder uebrig sind, muessen alle drei Minen sein."
  Prioritaet: hoch

- ID: `q-07-17`
  Problem: Bit-Ranking ist technisch/marketinghistorisch unsauber.
  Vorschlag: Auf Release-Reihenfolge statt "Rechenpower" wechseln.
  Neue Formulierung: "Sortiere diese Konsolen nach Europa-/Deutschland-Release, aelteste zuerst."
  Neue Optionen: `NES`; `Sega Mega Drive`; `Nintendo 64`; `PlayStation 2`
  Richtige Antwort: `NES`, `Sega Mega Drive`, `Nintendo 64`, `PlayStation 2`
  Explanation: "Release-Reihenfolge ist objektiver als Bit-Marketing, das ab der 32/64/128-Bit-Aera stark verwischt."
  Prioritaet: hoch

- ID: `q-09-19`
  Problem: Fragt nach Fleischsorten, enthaelt aber Kaese.
  Vorschlag: Prompt auf Lebensmittelvergleich aendern.
  Neue Formulierung: "Sortiere diese Lebensmittel nach grobem CO2-Fussabdruck pro kg, von niedriger zu hoeher."
  Neue Optionen: `Haehnchen`; `Schwein`; `Kaese`; `Rindfleisch`
  Richtige Antwort: `Haehnchen`, `Schwein`, `Kaese`, `Rindfleisch`
  Explanation: "Rind liegt typischerweise deutlich hoeher als Schwein oder Haehnchen; Kaese ist als tierisches Produkt ebenfalls relevant, aber kein Fleisch."
  Prioritaet: mittel

- ID: `q-02-new-37-safe-word`
  Problem: Explanation verharmlost `Stopp`, indem sie sagt, es werde oft als Ermutigung interpretiert.
  Vorschlag: Consent-sicher neu schreiben.
  Neue Formulierung: "Wozu dient ein Safe Word bei BDSM oder intensivem Sex?"
  Neue Optionen: `Es beendet die Situation sofort`; `Es startet eine neue Runde`; `Es ersetzt Verhuetung`; `Es ist nur ein Insider-Witz`
  Richtige Antwort: `Es beendet die Situation sofort`
  Explanation: "Ein Safe Word ist ein vorher vereinbartes Stoppsignal. Unabhaengig davon gilt: Wenn jemand ernsthaft `Stopp` sagt oder nicht mehr mitmachen will, wird sofort aufgehört."
  Prioritaet: hoch

- ID: `q-10-01`
  Problem: Minderjaehrigen- und Nacktbilder-Kontext.
  Vorschlag: Gleiche Nostalgie ohne Sexualisierung.
  Neue Formulierung: "Es ist 23:00 Uhr, du willst heimlich ins Internet und niemand soll merken, dass die Telefonleitung blockiert ist. Welches Geraeusch verraet dich?"
  Neue Optionen: Open Text mit Aliases
  Richtige Antwort: `Einwahlgeraeusch des Modems`
  Explanation: "Das Piepen und Rauschen des Modems war unverkennbar und machte heimliches Surfen fast unmoeglich."
  Prioritaet: hoch

- ID: `q-10-14`
  Problem: Fehlende Explanation und subjektive Reihenfolge.
  Vorschlag: Zu Majority-Guess oder MC umbauen.
  Neue Formulierung: "Welche Eingabemethode war fuer geuebte 2000er-Handy-Nutzer der groesste Blind-Tipp-Vorteil?"
  Neue Optionen: `T9 auf Zifferntasten`; `Mehrfachtippen ohne T9`; `BlackBerry-QWERTZ`; `moderner Touchscreen`
  Richtige Antwort: `T9 auf Zifferntasten` oder Mehrheit entscheidet, je nach gewünschtem Modus
  Explanation: "T9 erlaubte, jede Taste nur einmal pro Buchstabe zu druecken; die gefuehlte Geschwindigkeit haengt aber stark von Uebung ab."
  Prioritaet: mittel

## Gute Fragen (bleiben koennen)

- `ID: q-01-02` -> Staerke: Echte Logik mit klar nachvollziehbarer Elderstab-Kette.
- `ID: q-01-04` -> Staerke: Ranking ist objektiv und gut erklaert.
- `ID: q-01-11` -> Staerke: Filmwissen plus sauberer Denkweg, gute Logic-Frage.
- `ID: q-03-01` -> Staerke: T9-Logik ist kurz, loesbar und nostalgisch.
- `ID: q-03-03` -> Staerke: Release-Ranking ist objektiv und passend fuer Millennials.
- `ID: q-04-04-ranking-starts` -> Staerke: Objektive Zeitachsenidee gut; nur Ton der Explanation glätten.
- `ID: q-05-05` -> Staerke: Rechenfrage ist eindeutig und thematisch passend.
- `ID: q-05-16` -> Staerke: Gute Alltagslogik mit klarer Rechnung.
- `ID: q-06-03` -> Staerke: Erklaert einen Popkultur-Moment durch Kategorienlogik.
- `ID: q-06-14` -> Staerke: Reality-TV-Reihenfolge ist objektiv und unterhaltsam.
- `ID: q-07-02` -> Staerke: Minesweeper-Logik ist eindeutig und schnell erklaerbar.
- `ID: q-07-06` -> Staerke: Konami-Code funktioniert als schnelle Nostalgiefrage.
- `ID: q-07-15` -> Staerke: Pac-Man-Kill-Screen ist nerdig, aber sauber erklaert.
- `ID: q-07-26` -> Staerke: Sehr klare Minesweeper-Regel, guter Logic-Typ.
- `ID: q-08-09` -> Staerke: Musik-/Lyrics-Frage mit guter Aufloesung.
- `ID: q-08-12` -> Staerke: VIVA-Ende ist klar datiert.
- `ID: q-09-09` -> Staerke: Praktische Adulting-Frage mit brauchbarer Explanation.
- `ID: q-09-13` -> Staerke: Kalorienranking ist objektiv und alltagstauglich.
- `ID: q-10-10` -> Staerke: Open-Text-Frage mit guten Aliases und fairer Antwortbreite.
- `ID: q-10-11` -> Staerke: Technik-Evolution ist klar, nostalgisch und mit Aliases fair.

## Luecken im Fragenmix & Empfehlungen

- Fehlende Typen/Themen: Der spielbare Katalog ist mit 370/520 Fragen stark Multiple-Choice-lastig. Es gibt nur 26 Logic-, 24 Ranking-, 11 Majority-Guess- und 10 Open-Text-Fragen.
- 18+-Mix: Der Katalog braucht weniger explizite Praktiken und mehr sichere Begriffs-/Consent-/Dating-Slang-Fragen. Gute Themen waeren `Consent`, `Red Flags`, `Ghosting`, `Situationship`, `Aftercare`, `STI-Schutz`, aber sachlich und ohne grafische Details.
- Fact-Mix: Mehr Fragen mit stabilen, klar datierten Fakten; weniger "aktuell", "laut Umfrage" oder "Durchschnitt" ohne Quelle.
- Ranking-Mix: Rankings nur verwenden, wenn Reihenfolge objektiv ist. Subjektive Party-, Scham- oder Geschmacksfragen als `majority_guess` spielen.
- Deduplizierung: Doppelte Nostalgiekerne reduzieren, z.B. Hogwarts-Treppen, Blue Shell, MySpace-Tom, Red-Bull-Zucker, Britney-55-Stunden-Ehe, Pimp-My-Ride-Defekte, 9Live, Beer-Consumption, CRT-Gewicht.
- Vorschlaege fuer neue Fragen: Mehr kurze deutsche Alltagslogik (`Mietvertrag`, `Waschsymbol`, `Kuechenbrand`), mehr faire Open-Text-Nostalgie mit Aliases (`Nero`, `Winamp`, `Clippy`, `T9`), mehr Majority-Guess ohne Peinlichkeitsdruck.

## Priorisierte Fixliste

1. 18 doppelte Option-IDs in den alten `q-07-*`-Fragen reparieren oder diese alten Dubletten aus dem spielbaren Pool nehmen.
2. 18+-Fragen mit Minderjaehrigen-, grafischen, entwürdigenden oder Ekel-Kontexten entfernen.
3. Kritisch falsche Fragen korrigieren: `q-04-12-a015ede7fc`, `q-04-07-2a1f4b82bc`, `q-03-08`, `q-05-12`, `q-07-11`, `q-07-17`.
4. Fehlende Explanations fuer `q-10-04` und `q-10-14` ergaenzen oder Fragen umbauen.
5. Open-Text-Aliases fuer `q-09-12` und `q-09-21` ergaenzen.
6. Vage/volatile Schaetzwerte mit "aktuell", "laut Umfrage" oder unklarer Quelle entweder datieren, belegen oder entfernen.
7. Subjektive Rankings in `majority_guess` umwandeln.
8. Offensive, vulgaere oder medizinisch unsensible Explanations glaetten.
9. Doppelte Themencluster kuerzen, damit der Abend nicht mehrfach dieselbe Pointe spielt.
10. Nach Datenbereinigung `pnpm test` erneut laufen lassen und mindestens einen Katalog-Strukturcheck als Test ergaenzen.

## Validierungstest-Status

- pnpm test Ergebnis: Erfolgreich am 2026-04-28, 11 Testdateien bestanden, 126 Tests bestanden.
- Abweichungen zur manuellen Pruefung: Die vorhandenen Tests pruefen Protocol/Engine/Server-Verhalten, aber nicht Katalogqualitaet. Manuelle Pruefung fand deshalb Probleme, die Tests nicht abdecken: doppelte Option-IDs, fehlende Explanations, subjektive Rankings, unsichere Faktenquellen und 18+-Ton.
