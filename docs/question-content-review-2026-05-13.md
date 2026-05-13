# Inhaltlicher Fragenreview - 2026-05-13

Basis vor Umsetzung: Katalog in `data/quiz/questions/cat-*.json`, 386 Fragen.

Umsetzungsstand: Die in diesem Bericht priorisierten Fixes wurden umgesetzt. Der Katalog umfasst danach 380 Fragen.

Fokus: Leaks in sichtbaren Fragefeldern, Schaetzfragen, auffaellige Multiple-Choice-Optionen, Wiederholungs-Leaks, Fragetyp-/Schema-Mismatch und Render-Logik vor der Aufloesung.

## Vorgehen

- Katalogdateien `cat-01` bis `cat-10` geprueft.
- `node scripts/audit-questions.mjs` ausgefuehrt.
- Automatische Kandidatenlisten geprueft fuer:
  - exakte Schaetzwerte im Prompt/Context,
  - Ranking-Items in richtiger Reihenfolge,
  - auffaellige Optionslaengen,
  - Fragetypen, die per Shape-Detection anders geladen werden als im JSON angegeben,
  - fehlende/ungewoehnliche Erklaerungs- und Antwortfelder.
- Render-Strecke geprueft:
  - `apps/server/src/question-payloads.ts`
  - `apps/web-display/src/App.tsx`
  - `apps/web-display/src/components/DisplayRevealScreen.tsx`
  - `apps/web-host/src/components/HostQuestionStage.tsx`
  - `apps/web-host/src/components/HostRevealStage.tsx`
  - `apps/web-player/src/components/PlayerQuestionScreen.tsx`

## Umsetzungsstatus

- Doppelte Fragen entfernt: `q-01-01`, `q-01-13`, `q-01-18`, `q-02-new-01-pegging`, `q-02-new-10-vanilla-sex`.
- Triviale/ungeeignete Frage entfernt: `q-05-21-e6c973030f`.
- Fehlerhafte oder ungeeignete Fragetypen korrigiert: `q-03-02`, `q-03-06`, `q-05-11`, `q-07-30`, `q-09-03`, `q-09-17`, `q-10-05`.
- Auffaellige Multiple-Choice-Optionen angeglichen: `q-02-new-16-squirting`, `q-02-new-28-golden-shower`, `q-08-09`, `q-09-15`, `q-09-19-be189a5f35`.
- Mehrdeutige/interpretative Prompts entschaerft: `q-07-07-508618c674`, `q-08-14`.
- Ranking-Rohdaten gehaertet: `q-09-04`, `q-09-13`, `q-09-19`, `q-10-04`.
- Estimate-Context wird nicht mehr im `question:show` Payload gesendet; er kommt erst mit `question:reveal` als `estimateContext`.

## Gefundene Probleme

### Sicher fehlerhaft

- Datei: `data/quiz/questions/cat-09-adulting.json`
- Frage: `q-09-03`
- Problem: Die Frage ist als `type: "logic"` deklariert, hat aber keine Optionen und eine numerische Antwort (`reference_value: 750`). Der Loader wandelt sie deshalb in eine Estimate-Frage um. `scoring_rule: "exact_match"` wird dabei nicht ausgewertet; die Engine bewertet Estimates nach "closest wins".
- Warum kritisch: Inhaltlich ist das eine Rechen-/Logikfrage mit exakter Antwort. Im Spiel kann aber eine nur naehere Zahl gewinnen. Das ist kein sichtbarer Loesungs-Leak, aber ein sicherer Gameplay-Fehler.
- Empfohlener Fix: Entweder als echte Multiple-Choice-/Logic-Frage mit Optionen modellieren oder bewusst als Estimate formulieren und `scoring_rule` entfernen. Fuer diese Frage ist MC/Logic sauberer.

- Datei: `data/quiz/questions/cat-10-technik.json`
- Frage: `q-10-05`
- Problem: Die Antwort lautet `Absolut gar nichts`, die Erklaerung schraenkt aber selbst ein: `Solange nicht aktiv geschrieben wird`. Ausserdem laedt die Frage mangels Optionen als Freitextfrage.
- Warum kritisch: Die korrekte Aussage ist bedingt, nicht absolut. Wer weiss, dass Schreibvorgaenge, Caches oder Dateisystemzustand relevant sein koennen, wird die Aufloesung anfechten. Als Freitext ist die Antwort zudem unnötig fragil.
- Empfohlener Fix: Als MC umbauen: richtige Option etwa `Meist nichts, solange kein Schreibvorgang/Cache offen ist`; falsche Optionen plausibel, aber klar falsch. Alternativ Prompt auf `wenn gerade nichts geschrieben wird` einschraenken.

- Datei: `data/quiz/questions/cat-01-harry-potter.json`
- Frage: `q-01-01-6a920e98bc` und `q-01-01`
- Problem: Beide fragen nach dem ersten Gryffindor-Passwort im ersten Film; Antwort jeweils `Caput Draconis`.
- Warum kritisch: Wenn beide im selben Abend gezogen werden, wurde die Loesung der zweiten Frage bereits durch die erste Aufloesung verraten.
- Empfohlener Fix: Eine der beiden Fragen entfernen oder durch eine wirklich andere Filmfrage ersetzen. Keine neue Frage erfinden, wenn der Abend bereits genug Fragen hat.

- Datei: `data/quiz/questions/cat-01-harry-potter.json`
- Frage: `q-01-11-346e4e40a0` und `q-01-13`
- Problem: Beide fragen nach Lunas Tier-Kopfschmuck im sechsten Film; Antwort jeweils Loewe/bruellender Loewe.
- Warum kritisch: Wiederholungs-Leak innerhalb derselben Kategorie.
- Empfohlener Fix: Eine Variante entfernen oder klar umwidmen.

- Datei: `data/quiz/questions/cat-01-harry-potter.json`
- Frage: `q-01-13-28324b61c1` und `q-01-18`
- Problem: Beide fragen nach dem Opfer fuer den Eingang zur Horkrux-Hoehle; Antwort jeweils Blut.
- Warum kritisch: Wiederholungs-Leak innerhalb derselben Kategorie.
- Empfohlener Fix: Eine Variante entfernen oder ersetzen.

- Datei: `data/quiz/questions/cat-02-sex-liebe.json`
- Frage: `q-02-19-9a4055c1e7` und `q-02-new-01-pegging`
- Problem: Beide fragen nach der Bedeutung von Pegging.
- Warum kritisch: Wiederholungs-Leak, wenn beide gezogen werden.
- Empfohlener Fix: Eine Frage entfernen oder eine der beiden auf einen anderen Aspekt der Kategorie umstellen.

- Datei: `data/quiz/questions/cat-02-sex-liebe.json`
- Frage: `q-02-06-5956ed1b1a` und `q-02-new-10-vanilla-sex`
- Problem: Beide fragen nach Vanilla/Vanilla Sex.
- Warum kritisch: Wiederholungs-Leak.
- Empfohlener Fix: Eine Frage entfernen oder klar unterscheiden.

### Wahrscheinlich problematisch

- Datei: `data/quiz/questions/cat-02-sex-liebe.json`
- Frage: `q-02-new-16-squirting`
- Problem: Die korrekte Option ist deutlich laenger und sachlicher als die drei Witz-Distraktoren.
- Empfehlung: Optionsstil angleichen. Alle Optionen gleich lang und gleich sachlich oder gleich humorig formulieren.

- Datei: `data/quiz/questions/cat-02-sex-liebe.json`
- Frage: `q-02-new-28-golden-shower`
- Problem: Die korrekte Option ist sehr kurz und direkt, die falschen Optionen sind sichtbar alberne Wortspiele.
- Empfehlung: Distraktoren plausibler und aehnlich kurz machen.

- Datei: `data/quiz/questions/cat-05-party-drinks.json`
- Frage: `q-05-21-e6c973030f`
- Problem: Richtige Option `Man muss trinken` ist sehr kurz und alltagsnaheliegend; die falschen Optionen sind ueberzogen.
- Empfehlung: Entweder Frage entfernen, weil sie fuer die Zielgruppe trivial ist, oder falsche Optionen realistischer formulieren.

- Datei: `data/quiz/questions/cat-08-musik.json`
- Frage: `q-08-09`
- Problem: Richtige Option ist die einzige lange, konkrete Sacherklaerung; falsche Optionen sind kurze Gags.
- Empfehlung: Optionen auf vergleichbare Laenge und Plausibilitaet bringen.

- Datei: `data/quiz/questions/cat-09-adulting.json`
- Frage: `q-09-19-be189a5f35`
- Problem: Richtige Option ist deutlich laenger und fachlicher als die anderen Optionen.
- Empfehlung: Falsche Optionen fachlich und aehnlich lang formulieren.

- Datei: `data/quiz/questions/cat-09-adulting.json`
- Frage: `q-09-15`
- Problem: Richtige Option ist die einzige detaillierte technische Erklaerung. Der Unterschied ist weniger stark als bei anderen Fragen, aber sichtbar.
- Empfehlung: Distraktoren auf aehnliches Detailniveau bringen.

- Datei: `data/quiz/questions/cat-03-internet-slang.json`
- Frage: `q-03-02`
- Problem: Als Schaetzfrage modelliert, aber eigentlich eine harte Wissensfrage mit ikonischem Wert `160`.
- Empfehlung: Kann spielbar bleiben, sollte aber eher MC oder Fast-Guess sein, wenn keine "closest wins"-Dynamik gewuenscht ist.

- Datei: `data/quiz/questions/cat-03-internet-slang.json`
- Frage: `q-03-06`
- Problem: `type: "estimate_duel"` ist kein Runtime-Typ und wird per numerischem Answer als Estimate geladen. Inhaltlich ist `Top 8` eher Nostalgie-Wissen als Schaetzung.
- Empfehlung: Type auf `estimate` normalisieren oder als MC umbauen.

- Datei: `data/quiz/questions/cat-05-party-drinks.json`
- Frage: `q-05-11`
- Problem: Harte Rechts-/Promillezahl als Sudden-Death-Estimate; `context: "StVZO Deutschland"` ist als Quellenhinweis unpraezise.
- Empfehlung: Rechtlichen Kontext manuell fact-checken und als MC formulieren, wenn Streit vermieden werden soll.

- Datei: `data/quiz/questions/cat-07-gaming.json`
- Frage: `q-07-07-508618c674`
- Problem: `Module statt CDs` plus `Anblasen` ist nicht eindeutig genug; mehrere Cartridge-Konsolen koennen gedanklich passen, auch wenn N64 hier intendiert ist.
- Empfehlung: Prompt auf Nintendo 64 spezifizieren oder Distraktoren so waehlen, dass nur eine Cartridge-Konsole vorkommt.

- Datei: `data/quiz/questions/cat-07-gaming.json`
- Frage: `q-07-30`
- Problem: `151` ist keine echte Schaetzung, sondern Pokemon-Trivia. `inklusive Mew` fuehrt stark zur bekannten Zahl.
- Empfehlung: Als MC/Fast-Guess modellieren oder aus Estimate-Pools entfernen.

- Datei: `data/quiz/questions/cat-08-musik.json`
- Frage: `q-08-14`
- Problem: Antwort ist eine externe/interpretative Pop-Song-Erklaerung. Ohne Quellenkenntnis kann sie subjektiv wirken.
- Empfehlung: Als Fun-Fact-Frage spielbar, aber vor dem Abend inhaltlich fact-checken oder mit klarerer Formulierung absichern.

- Datei: `data/quiz/questions/cat-09-adulting.json`
- Frage: `q-09-17`
- Problem: Als `logic` deklariert, wird wegen numerischem Answer als Estimate geladen. Hier passt `closest wins` besser als bei `q-09-03`, aber der JSON-Typ ist irrefuehrend.
- Empfehlung: Type auf `estimate` normalisieren oder MC-Optionen anlegen.

- Datei: `data/quiz/questions/cat-09-adulting.json`, `data/quiz/questions/cat-10-technik.json`
- Frage: `q-09-04`, `q-09-13`, `q-09-19`, `q-10-04`
- Problem: Ranking-Fragen liegen teilweise nur als `answer.canonical_order` ohne explizite `items` vor. Der Loader rotiert diese Items inzwischen, daher ist aktuell kein sichtbarer Reihenfolge-Leak vorhanden. Rohdaten und Review-Tools sehen aber nur die Antwortliste.
- Empfehlung: Fuer langfristig robuste Daten `items` plus `correct_order` explizit pflegen.

### UI-/Rendering-Probleme

- Datei/Komponente: `apps/server/src/question-payloads.ts`
- Problem: `toQuestionShowPayload()` sendet bei Estimate-Fragen weiterhin `context` im `question:show` Payload an Display und Host. Display/Host rendern diesen Context in der Fragephase aktuell nicht mehr, Player erhalten ihn nicht. Sichtbar ist also kein Leak mehr, payload-seitig ist es aber weiterhin ein Loesungs-/Hinweisfeld vor der Aufloesung.
- Fix: Falls Payload-Level-Geheimhaltung gewuenscht ist, `context` aus `question:show` fuer aktive Fragen entfernen und den Reveal-Kontext ueber `question:reveal` oder ein separates Reveal-Feld transportieren. Das waere eine kleine Protokoll-/Schema-Aenderung mit Tests.

- Datei/Komponente: `apps/web-display/src/App.tsx`
- Problem: Kein aktueller sichtbarer Leak gefunden. Aktive Estimate-Fragen zeigen nur `Schaetzung in {unit}`.
- Fix: Kein Fix noetig.

- Datei/Komponente: `apps/web-host/src/components/HostQuestionStage.tsx`
- Problem: Kein aktueller sichtbarer Leak gefunden. Aktive Estimate-Fragen zeigen nur `Schaetzungen laufen... ({unit})`.
- Fix: Kein Fix noetig.

- Datei/Komponente: `apps/web-player/src/components/PlayerQuestionScreen.tsx`
- Problem: Kein aktueller sichtbarer Leak gefunden. Estimate-Placeholder nutzt nur die Einheit (`{unit} eingeben...`), Freitext nutzt `Antwort eingeben...`.
- Fix: Kein Fix noetig.

- Datei/Komponente: `apps/web-display/src/components/DisplayRevealScreen.tsx`, `apps/web-host/src/components/HostRevealStage.tsx`, `apps/web-player/src/components/PlayerQuestionScreen.tsx`
- Problem: Antworten, Erklaerungen und Estimate-Kontext werden erst in Reveal-Komponenten angezeigt. Das entspricht dem erwarteten Ablauf.
- Fix: Kein Fix noetig.

## Geänderte Dateien

- Katalogdaten: `data/quiz/questions/cat-01-harry-potter.json` bis `cat-10-technik.json`.
- Protokoll/Server/UI: Estimate-Kontext aus der Fragephase entfernt und in den Reveal-Payload verschoben.
- Tests: Shared-Protocol- und Server-Tests fuer Estimate-Context ergaenzt.
- Dokumentation: dieser Bericht aktualisiert; alter Audit als historisch markiert.

## Validierung

- `node scripts/audit-questions.mjs` ausgefuehrt.
- Ergebnis nach Umsetzung: 380 Fragen, 0 Estimate-Leak-Fehler, 0 Ranking-Reihenfolge-Fehler, 0 zu lange Prompts, 0 exakte ID-Duplikate.
- Die zuvor priorisierten Integrity-Hinweise wurden bereinigt.
- `corepack pnpm typecheck` erfolgreich.
- `corepack pnpm test` erfolgreich: 18 Testdateien, 226 Tests.
- `corepack pnpm build` erfolgreich.
- `corepack pnpm lint` erfolgreich mit 13 bestehenden `noExplicitAny`-Warnungen in nicht geaenderten Test-Helfern.

## Noch offen / manuell prüfen

- Punkt: Rechts-/Faktenfragen fact-checken.
- Grund: `q-05-11` und `q-10-05` wurden entschärft; vor dem Abend bleibt ein kurzer Faktencheck sinnvoll, wenn die Runde bei Rechts-/Technikdetails streng ist.

- Punkt: Explizite cat-02-Fragen moderationell gegen Gaesteliste pruefen.
- Grund: Kein Loesungs-Leak, aber die Kategorie ist sehr direkt und kann je nach Runde unpassend sein.

## Fazit

Der Fragebogen ist nach den Leak- und Inhaltsfixes grundsaetzlich spielbar: Es wurden keine verbleibenden sichtbaren Schaetzfragen-Leaks in Display, Host oder Player gefunden, und der Estimate-Kontext wird auch payload-seitig erst zur Aufloesung verschickt.

Fuer einen privaten Abend ist der Katalog jetzt deutlich sauberer nutzbar. Weitere Qualitätskontrolle ist nur noch fuer Faktenstrenge, explizite cat-02-Passung zur Gaesteliste und die historische Doku-Konsistenz sinnvoll.
