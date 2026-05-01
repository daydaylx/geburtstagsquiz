# Fragenkatalog-Audit – Geburtstagsquiz

_Auditiert am 2026-05-01. Rolle: Senior Quiz-QA-Auditor._

---

## Kurzfazit

- **Gesamtqualität:** 6/10
- **Größtes Risiko:** cat-01 hat 8 eindeutige Duplikate durch paralleles Laden von v4 und v5 – beide Dateien fragen dieselben Fakten nochmal. Wenn beide Versionen einer Kategorie im selben Spielabend landen, spielen Teilnehmer Fragen doppelt.
- **Sofort entfernen:** 18
- **Überarbeiten:** 31
- **Kritische Schemafehler:** 0 (Normalisierung funktioniert korrekt)
- **Nicht-kanonische Typen in JSON:** 107 Fragen (`standard`, `common_mistake`, `fast_guess`, `pattern`, `estimate_duel`, `sudden_death_estimate`) – kein Laufzeitfehler, aber unordentlich
- **Faktisch unsichere Stellen:** 6

---

## Gefundene Fragenquellen

| Datei | Fragenanzahl | Status |
|---|---:|---|
| `geburtstagsquiz_millennials_engine_v4_release_candidate.json` | 220 | aktiv geladen |
| `geburtstagsquiz_millennials_engine_v5_expanded.json` | 282 | aktiv geladen |
| **Gesamt** | **502** | beide via `quiz-data.ts` zusammengeführt |

Beide Dateien decken **10 Kategorien** ab (cat-01 bis cat-10). Beide enthalten Fragen für dieselben Kategorien – daher die Duplikate. Die Zusammenführung erfolgt ID-basiert: bei gleicher ID gewinnt die zuletzt geladene Version (v5).

---

## 1. Schema- und Runtime-Kompatibilität

### Befund: Technisch sauber, aber 107 Fragen mit nicht-kanonischen Typnamen

Die Normalisierung in `apps/server/src/quiz-data.ts` erkennt Fragetypen per Struktur (Felder), nicht per `type`-String. Daher funktionieren alle nicht-kanonischen Typen korrekt:

| Nicht-kanonischer Typ | Anzahl | Normalisiert zu |
|---|---:|---|
| `standard` | 47 | `multiple_choice` |
| `common_mistake` | 20 | `multiple_choice` (falls `is_correct` gesetzt) oder `logic` |
| `fast_guess` | 13 | `multiple_choice` |
| `pattern` | 12 | `multiple_choice` |
| `sudden_death_estimate` | 8 | `estimate` |
| `estimate_duel` | 7 | `estimate` |

**Kein P0-Fehler.** Die Unit-Tests (502 Fragen, keine Issues) bestätigen das.

### Kritische Fehler

_Keine._

### Warnungen

- **Beide Dateien haben dieselbe `quiz_id`** (`geburtstagsquiz-millennials-v2-engine-v2`) – kein Laufzeitfehler, da die ID aus der zuletzt geladenen Datei verwendet wird. Aber verwirrend im Code.
- **8 Estimate-Fragen fehlt das `context`-Feld im Raw-JSON**: Sie nutzen `answer.canonical` als Fallback, der als Erklärungstext erscheint. Funktioniert, aber der Kontext ist dann der Antworttext, nicht eine echte Erklärung.
  - Betroffen: `q-07-07`, `q-07-20`, `q-07-28`, `q-07-30`, `q-08-01`, `q-08-07`, `q-08-12`, `q-08-15`

---

## 2. Duplikate & Redundanzen

Dies ist der kritischste Bereich. Beide Katalogdateien füllen dieselben Kategorien auf – v4 mit 220 Fragen, v5 mit 282 Fragen. Da cat-01 z.B. in v4 25 Fragen hat und in v5 ebenfalls 25 Fragen (andere IDs), landen im Spiel 50 Fragen für Harry Potter. Dabei sind viele inhaltlich identisch.

### Entfernen empfohlen – exakte Duplikate

**cat-01 (Harry Potter)**

| Zu entfernen | Zu behalten | Ähnlichkeit | Grund |
|---|---|---|---|
| `q-01-10-new` | `q-01-07` | Identical: Moody / Barty Crouch Jr. Zungenzeigen | q-01-07 hat bessere Distraktoren (unterschiedliche Körperseiten) |
| `q-01-11-346e4e40a0` | `q-01-13` | Identical: Luna Lovegood Löwenkopf | q-01-13 hat präzisere Antwortoptionen |
| `q-01-21-89c1ef5e21` | `q-01-19` | Identical: Snapes Patronus (Hirschkuh) | q-01-19 hat mehr Distraktoren im richtigen semantischen Feld |
| `q-01-e02-0ed6866105` | `q-01-24` | Identical: HP1 Produktionsbudget 125M USD | Gleicher Fakt, gleiches Ergebnis |
| `q-01-e03-a6553820f8` | `q-01-23` | Identical: DH2 Box Office 1342M USD | Gleicher Fakt, gleiches Ergebnis |
| `q-01-12-d56fa12b3e` | `q-01-15` | Identical: Slughorn verschüttet Wein bei Aragogs Beerdigung | q-01-15 hat prägnantere Erklärung |
| `q-01-13-28324b61c1` | `q-01-18` | Identical: Blut als Opfer für Horkrux-Höhle | q-01-18 hat sauberere Ablenkoptionen |

**Grenzfall cat-01: Treppen-Paar**

| Zu entfernen | Zu behalten | Kommentar |
|---|---|---|
| `q-01-17` | `q-01-e01-c564fe35e2` | q-01-17 fragt nach „beweglichen Treppen" = 142, aber 142 ist die Gesamtanzahl ALLER Treppen, nicht der beweglichen. Faktischer Fehler im Prompt. Entfernen oder komplett neu formulieren. |

**cat-06 (Popkultur-Meltdowns)**

| Zu entfernen | Zu behalten | Ähnlichkeit |
|---|---|---|
| `q-06-10` | `q-06-05-255c734412` | Identical: Paris Hilton als „Urmutter der It-Girls" (Sextape, Simple Life) |
| `q-06-14` | `q-06-12-4ae5daa5e8` | Identical: Typisches Merkmal der Emo-Welle der 2000er |
| `q-06-07` | `q-06-e01-efc82aae93` | Identical: Britney Spears Las-Vegas-Ehe, 55 Stunden – gleicher Wert, marginale Umformulierung |

**cat-08 (Musik)**

| Zu entfernen | Zu behalten | Ähnlichkeit |
|---|---|---|
| `q-08-e03-aac1454a8b` | `q-08-12` | Identical: VIVA-Einstellungsjahr 2018 – q-08-12 hat den eingebetteten Kontext in der Frage |

**cat-05 (Saufen/Feiern)**

| Zu entfernen | Zu behalten | Ähnlichkeit |
|---|---|---|
| `q-05-e02-4d430361dd` | `q-05-08` | Identical: Zucker in Red Bull 250ml = 27,5g. Gleicher Wert, gleiche Frage |

### Überarbeiten empfohlen – thematische Überschneidungen

- `q-01-e01` und `q-01-17` (wenn q-01-17 nicht entfernt wird): Treppen 142 zweimal, beide als Estimate. → Eine entfernen, eine als Multiple Choice umformulieren.
- `q-03-e02` (Google kauft YouTube für 1310 Mio. Euro) und `q-06-09` (Google kauft YouTube für 1,65 Mrd. $): Gleicher Fakt, andere Einheit. Für ein Partyquiz verwirrend. → Eine Frage wählen, Einheit fixieren.
- cat-09 hat 3 Ranking-Fragen über Lebensmittel (q-09-13 Kalorien, q-09-19 CO2, q-09-10 schematisch) – alle Sortier-nach-Wert-Fragen mit Nahrungsmitteln. Zu ähnlicher Aufbau in einer Kategorie.

---

## 3. Antwortqualität

### Zu leicht / Zu offensichtlich

- `q-01-19-fd285a0207`: „Verteidigung gegen die dunklen Künste" (37 Zeichen) vs. „Zaubertränke" (12), „Verwandlung" (12), „Kräuterkunde" (12). Richtige Antwort 3x länger als alle anderen. → Distraktoren auf ähnliche Länge bringen.
- `q-08-13-3356a1a3b7`: Richtige Antwort signifikant länger als die 1-Wort-Distraktoren.
- `q-09-19-be189a5f35`: Richtige Antwort 56 Zeichen, Durchschnitt der falschen ~20 Zeichen.
- `q-10-07-c46b85b036`: „1,44 Megabyte" (36 Zeichen) vs. Einzelwort-Distraktoren (6 Zeichen).
- `q-10-25-258ab2b479`: Richtige Antwort 48 Zeichen, falsche ~15 Zeichen.

**Gesamt: 19 Fragen mit Längen-Leak** (richtige Antwort >2,5x länger als Durchschnitt der falschen Antworten). Alle korrekt verlinkt, aber im Spielfluss sofort enttarnt.

### Schwache Distraktoren

- `q-08-25-efd407f660` (Autotune): Option „Verursachte wissenschaftlich belegte Kopfschmerzen" ist zu absurd für ein Partyquiz – kein ernsthafter Distraktor.
- `q-01-05-c97cd9c5d9`: Option „Den Sucher-Instinkt" ist kein körperlicher Körperteil – fällt aus dem Rahmen der seriösen Optionen heraus.
- `q-02-01-c95a802a2d`: Opion „Brot und Dinkel-Sauerteig-Mischung" – zu albern und verrät die richtige Antwort durch Ausschluss.

### Mehrdeutig

- `q-01-10` (common_mistake): „Fan-Deutung" von Snapes Zaubertrank-Worten als Trauer/Reue – das ist eine Fandom-Interpretation, keine Filmfakts. Im Partyquiz schwierig, da Spieler berechtigt anfechten können, dass es mehrere Interpretationen gibt. → Als Majority-Guess reformulieren oder mit stärkerer Quellenangabe versehen.
- `q-07-01`: „Welches Item in Mario Kart ist die personifizierte soziale Ungerechtigkeit..." – Frage auf den blauen Panzer (Blue Shell) abzielend, aber die Frage selbst nennt ihn nicht. Bei unterschiedlichen Mario-Kart-Generationen könnte es Diskussion geben. Klar formulieren: „Blauer Panzer" explizit nennen.

### Für Estimate-Fragen: Schätzqualität

Gut schätzbare Fragen (Diskussion ist möglich):
- `q-09-10` (Pfand für Bierkasten 3,10€): exakt berechenbar – kein echter Schätzmoment
- `q-05-24` (35 Shots aus 0,7L): exakt berechenbar, kein Schätzen nötig
- `q-09-18` (10 Liter in Kasten mit 20×0,5L): reine Grundschule-Mathe, kein Erkenntniswert

Diese drei sollten als `logic`-Fragen reformuliert oder komplett gestrichen werden – sie sind keine Schätzfragen.

---

## 4. Faktencheck

### Faktisch falsch

- `q-01-17` | **Bewegliche Treppen in Hogwarts = 142**
  - Aktuell: Prompt fragt nach „bewegliche Treppen" = 142
  - Korrekt: 142 ist die Gesamtanzahl ALLER Treppen in Hogwarts (Bücher/Filme), nicht nur der beweglichen. Die beweglichen Treppen sind eine Teilmenge.
  - Fix: Prompt auf „Wie viele Treppen gibt es insgesamt in Hogwarts?" ändern, oder Frage streichen (Duplikat zu `q-01-e01`).

### Unsicher / Prüfen

- `q-08-e01` | **Dragostea Din Tei – 14 Wochen Platz 1 Deutschland**
  - Warum unsicher: O-Zone's Hit war 2003 ein massiver Erfolg in Deutschland, aber 14 Wochen Platz 1 ist eine sehr spezifische Zahl, die schwer zu verifizieren ist ohne Primärquelle. Offizielle Chartsdaten von GfK-Charts wären nötig.
  - Recherche nötig: Ja. Wenn falsch, als Schätzfrage belassen (kein falscher Wert kommuniziert), aber Explanation anpassen.

- `q-03-e01` | **MySpace Peak 75,9 Millionen aktive Nutzer**
  - Warum unsicher: MySpace soll 2008 ca. 100–115 Mio. registrierte Nutzer gehabt haben. 75,9 Mio. könnte eine spezifische monatlich aktive Nutzerzahl sein, aber der Kontext ist unklar.
  - Recherche nötig: Ja. Alternativ: Frage breiter formulieren.

- `q-07-07` | **Game Boy Classic wiegt 300g**
  - Warum unsicher: 300g ist das Gewicht ohne Batterien. Mit 4 AA-Batterien (~100g zusätzlich) wäre es ~390g. Der Prompt sagt „inkl." ohne Spezifikation.
  - Fix: Entweder „ohne Batterien" klarstellen oder Wert auf 390g ändern.

- `q-08-01` | **Schnappi 10 Wochen auf Platz 1**
  - Warum unsicher: Schnappi war 2005 tatsächlich sehr erfolgreich, aber 10 Wochen Platz 1 ist eine spezifische Zahl. Erklärung sagt nur „10 Wochen" ohne Quelle.
  - Recherche nötig: Bedingt. Als Estimate-Frage ist eine leicht abweichende Zahl kein Totalausfall.

- `q-01-12` | **Voldemort von 6 Schauspielern verkörpert**
  - Warum unsicher: Abhängig davon, ob man Quirrells Stimme (Ian Hart), CGI-Körper, junge Tom Riddle-Darsteller separat zählt. Erklärung listet 6 explizit auf, aber die Zählung ist interpretationsabhängig.
  - Recherche nötig: Bedingt. Als Partyquiz-Frage vertretbar, wenn Erklärung die 6 konkret benennt (was sie tut).

- `q-06-09` | **Google kauft YouTube für 1,65 Mrd. $**
  - Aktuell: 1,65 Milliarden USD – das ist korrekt. Aber `q-03-e02` nennt denselben Kauf mit 1310 Mio. Euro. Bei Google-Übernahme Oktober 2006 war der Wechselkurs ca. 1 USD = 0,79 EUR, also $1,65 Mrd. ≈ 1,30 Mrd. Euro. Beide Zahlen sind grob korrekt. Aber im selben Spiel aus zwei verschiedenen Kategorien kann das Diskussionen auslösen.
  - Fix: Eine der beiden Fragen entfernen.

---

## 5. Kategorieberichte

---

### Kategorie: cat-01 – Harry Potter (Nur Filme, harter Schwierigkeitsgrad)

**Überblick**
- Fragenanzahl: 50 (25 aus v4 + 25 aus v5)
- Fragetypen: multiple_choice (22+7), estimate (6+5), ranking (3+3), logic (4+4), common_mistake (3), standard (7), pattern (1), majority_guess (1), estimate_duel (1), fast_guess (1), sudden_death_estimate (1)
- Durchschnittliche Qualität: 5/10
- Risiko für Spielabend: **hoch** (massenhafte Duplikate, Faktenfehler bei Treppen-Frage)

**Stärken**
- Die v5-exklusiven Fragen (logic, ranking, common_mistake) bieten echte Tiefe für HP-Kenner.
- `q-01-02` (Logik-Check Elderstab) ist eine excellent gestellte Denksport-Frage.
- `q-01-03` (common_mistake: Neville statt Dobby im Film) ist ein perfektes Cat-1-Highlight.
- `q-01-04` (Ranking Horkruxe) funktioniert gut, da die Reihenfolge diskutierbar ist.

**Hauptprobleme**
- 8 Duplikate zwischen v4 und v5 (gleiche Fakten, verschiedene IDs).
- Faktenfehler bei q-01-17 (bewegliche Treppen = 142, aber 142 ist Gesamtzahl).
- 5 Fragen mit Längen-Leak bei Antwortoptionen.

**Kritische Fixes**
- `q-01-17` → Entfernen oder Prompt korrigieren (Duplikat zu q-01-e01, außerdem faktisch irreführend)

**Entfernen** (Duplikate aus v4 – die v5-Versionen haben meist bessere Optionen):
- `q-01-10-new` (Duplikat zu q-01-07)
- `q-01-11-346e4e40a0` (Duplikat zu q-01-13)
- `q-01-21-89c1ef5e21` (Duplikat zu q-01-19)
- `q-01-e02-0ed6866105` (Duplikat zu q-01-24)
- `q-01-e03-a6553820f8` (Duplikat zu q-01-23)
- `q-01-12-d56fa12b3e` (Duplikat zu q-01-15)
- `q-01-13-28324b61c1` (Duplikat zu q-01-18)
- `q-01-17` (Duplikat + Faktenfehler; q-01-e01 bleibt)

**Überarbeiten**
- `q-01-19-fd285a0207`: Distraktoren auf ähnliche Länge bringen (alle auf 3-4-Wort-Optionen kürzen).
- `q-01-10` (common_mistake, Snape Fan-Deutung): Als Majority-Guess reformulieren oder mit Hinweis „Fandom-Interpretation" in Prompt versehen.

**Behalten (Highlights)**
- `q-01-02` (Elderstab-Logik): Excellent.
- `q-01-03` (Neville vs. Dobby Gillyweed): Klassischer common-mistake-Moment.
- `q-01-04` (Horkrux-Ranking): Gute Herausforderung.
- `q-01-09` (Marauder-Tode Ranking): Funktioniert, weil die Reihenfolge diskutierbar ist.
- `q-01-08` (Majority-Guess: nervigster Charakter im Auto): Partymoment.

---

### Kategorie: cat-02 – Sex, Liebe & expliziter Bullshit

**Überblick**
- Fragenanzahl: 79 (75 MC + 4 Estimate)
- Fragetypen: multiple_choice (75), estimate (4)
- Durchschnittliche Qualität: 7/10
- Risiko für Spielabend: **niedrig**

**Stärken**
- Thematisch konsistent, für die Zielgruppe passend explizit.
- Gute Mischung aus Bildungswissen (Anatomie, STIs) und Slang-Definitionen.
- Distraktoren sind durchgehend auf ähnlichem Witzniveau, ohne Längen-Leaks.
- Estimate-Fragen (Penislänge, Alter beim ersten Mal, Partneranzahl) sind legitime Schätzmomente mit guten Diskussionspotenzial.

**Hauptprobleme**
- 79 Fragen sind zu viele für eine Kategorie – selbst für „full evening" ist das ein Block.
- `q-02-05` (Unterschied Libido/Potenz) und `q-02-20` (Unterschied Orientierung/Identität): gleicher Fragetyp „Was ist der Unterschied zwischen X und Y" – kein echter Duplikat, aber monotone Struktur.
- `q-02-10` (Konsens) ist sehr seriöser Ton inmitten ansonsten lockerer Fragen – kann Stimmung kurz dämpfen.

**Kritische Fixes**
- Keine.

**Überarbeiten**
- `q-02-05` oder `q-02-20`: Umformulieren, damit sie strukturell nicht identisch sind.

**Behalten (Highlights)**
- `q-02-04` (WAP-Bedeutung): Klassiker.
- `q-02-07` (Ghosting): Klar, kurz, alle kennen es.
- `q-02-02` (Netflix & Chill): Zeitlos gut.

---

### Kategorie: cat-03 – Cringe Millennial-Slang & Internet-Fossilien

**Überblick**
- Fragenanzahl: 44
- Fragetypen: multiple_choice (25), estimate (6), ranking (2), logic (2), majority_guess (2), common_mistake (2), estimate_duel (1), pattern (1), fast_guess (1), standard (1), sudden_death_estimate (1)
- Durchschnittliche Qualität: 8/10
- Risiko für Spielabend: **niedrig**

**Stärken**
- Beste Mischung aus Fragetypen im gesamten Katalog.
- Estimate-Fragen (ICQ-Nummer-Länge, YouTube-erstes-Video, SMS-Länge) sind genuine Schätzmomente.
- Ranking-Frage `q-03-mac9aa73df0` (Plattformen in Nutzungsreihenfolge) ist ein echter Diskussionsmoment.
- Nostalgie-Wert ist hoch und konsistent für Millennials (ICQ, MySpace, T9, MSN).

**Hauptprobleme**
- `q-03-e01` (MySpace-Peak 75,9 Mio.) – Zahl faktisch unsicher.
- `q-03-e02` und `q-06-09` fragen beide nach dem YouTube-Kauf durch Google, aber in anderen Einheiten.

**Kritische Fixes**
- `q-03-e01`: Explanation mit Quellenhinweis versehen; falls Zahl falsch, Reference Value anpassen.

**Überarbeiten**
- `q-03-e02`: Entweder streichen (Duplikat-Thema zu `q-06-09`) oder explizit auf „in Euro" eingehen und `q-06-09` streichen.

**Behalten (Highlights)**
- `q-03-01` (T9-Logik HALLO): Excellent – aber Prompt ist 135 Zeichen lang, auf TV kürzen.
- `q-03-09` (ICQ-Nummer Länge 9 Stellen): Perfekte Schätzfrage mit Nostalgie.
- `q-03-13` (YouTube erstes Video 19 Sekunden): Überraschungsmoment.

---

### Kategorie: cat-04 – 90er/00er Trash-TV & kollektives Trauma

**Überblick**
- Fragenanzahl: 41
- Fragetypen: multiple_choice (13), standard (12), logic (3), ranking (2), common_mistake (2), majority_guess (1), pattern (1), estimate (4), estimate_duel (1), fast_guess (1), sudden_death_estimate (1)
- Durchschnittliche Qualität: 6/10
- Risiko für Spielabend: **mittel**

**Stärken**
- Thema ist für Millennials perfekt – RTL, Zlatko, GZSZ, Pimp My Ride.
- Majority-Guess `q-04-06-majority-shame` (schlimmster TV-Tiefpunkt der 2000er) ist Partymoment.
- Ranking `q-04-04-ranking-starts` (Reality-Shows nach Startjahr) ist spielerisch stark.

**Hauptprobleme**
- **6 Fragen mit Prompts >150 Zeichen** – zu lang für TV-Display und 20–40 Sekunden Spielzeit.
  - `q-04-05-mistake-alm` (213 Zeichen!): Prompt viel zu lang, wird auf dem TV zerhackt.
  - `q-04-03-logic-kader` (181 Zeichen): Kader-Loth-Logik mit 5 Shows in einem Satz.
  - `q-04-25-logic-jungle` (155 Zeichen): Ausschlussverfahren mit langer Aufzählung.
- `q-04-10-logic-gerner` (GZSZ-Hochzeiten): Prompt 178 Zeichen, setzt detailliertes GZSZ-Wissen voraus – nischig selbst für Millennials.

**Kritische Fixes**
- `q-04-05-mistake-alm`: Prompt radikal kürzen. Vorschlag: „Wer hat das Genre der ekligen Promi-Prüfungen in Deutschland wirklich erfunden?" (nicht Dschungelcamp, sondern…).
- `q-04-03-logic-kader`: Auf maximal 100 Zeichen kürzen.

**Überarbeiten**
- `q-04-10-logic-gerner`: Entweder kürzen oder entfernen (zu nischig selbst für Hardcore-GZSZ-Fans).
- `q-04-25-logic-jungle` (155 Zeichen): Aufzählung in Optionen verlagern, Prompt kürzen.

**Behalten (Highlights)**
- `q-04-06-majority-shame` (schlimmster TV-Tiefpunkt): Partymoment.
- `q-04-e01` (Zlatko Tage in BB): Netter Schätzmoment.
- `q-04-14-fast-cribs` (MTV Cribs-Satz): Sofortiger Nostalgie-Hit, wenn man den Satz hört.

---

### Kategorie: cat-05 – Saufen, Feiern & toxische Jugend-Drinks

**Überblick**
- Fragenanzahl: 53
- Fragetypen: multiple_choice (25), estimate (6), standard (3), ranking (2), common_mistake (2), logic (4), majority_guess (3), pattern (3), estimate_duel (1), fast_guess (3), sudden_death_estimate (1)
- Durchschnittliche Qualität: 6/10
- Risiko für Spielabend: **mittel**

**Stärken**
- Thema garantiert Stimmung.
- Majority-Guess Fragen (Partydrinks, Scham-Momente) sind Partyhöhepunkte.
- `q-05-11` (Fahrrad-Promille-Grenze) ist echtes Erwachsenen-Wissen.

**Hauptprobleme**
- **Duplikat entdeckt**: `q-05-e02` und `q-05-08` fragen beide nach Zucker in Red Bull 250ml (27,5g).
- **3 Fragen sind keine echten Schätzfragen**: `q-09-10`, `q-05-24`, `q-09-18` sind reine Rechenaufgaben.
- `q-05-05` (189 Zeichen, Vorglühen-Vodka-Mathe): extrem langer Prompt für ein Party-Quiz.
- `q-05-16` (180 Zeichen, Geteiltes Vorglühen): ebenfalls zu lang.

**Kritische Fixes**
- `q-05-e02-4d430361dd`: Entfernen (Duplikat zu `q-05-08`).

**Überarbeiten**
- `q-05-05` und `q-05-16`: Prompts auf <120 Zeichen kürzen. Die Rechenaufgabe im Prompt ist für TV ungeeignet.
- `q-05-24` und `q-05-11` als `logic`-Fragen neu typisieren (keine echten Schätzmomente).

**Behalten (Highlights)**
- `q-05-11` (Fahrrad-Promille): Gutes Erwachsenenwissen mit Überraschungswert.
- `q-05-e03` (Smirnoff Ice Vol-% = 5%): Schätzmoment mit Nostalgie.
- Majority-Guess Fragen in dieser Kategorie: durchgehend stark.

---

### Kategorie: cat-06 – Absurde Skandale & Popkultur-Meltdowns

**Überblick**
- Fragenanzahl: 52
- Fragetypen: multiple_choice (25), estimate (3), standard (14), common_mistake (1), logic (2), ranking (2), pattern (1), majority_guess (1), estimate_duel (1), fast_guess (1), sudden_death_estimate (1)
- Durchschnittliche Qualität: 6/10
- Risiko für Spielabend: **mittel**

**Stärken**
- Thema ist für Millennials perfekt: Britney, Kanye, Paris Hilton, Nipplegate.
- Estimate `q-06-07` (Britney 55-Stunden-Ehe) ist ein Partymoment.
- `q-06-03` (Kanye-Logik bei VMAs) ist eine gut gestellte Logik-Frage.

**Hauptprobleme**
- **3 Duplikate**: Paris Hilton, Emo-Welle, Britney-Ehe (je v4 vs. v5 Version).
- **YouTube-Kauf doppelt** in cat-03 und cat-06 (verschiedene Einheiten).
- 52 Fragen ist viel für eine Kategorie.

**Kritische Fixes**
- `q-06-10`, `q-06-14`, `q-06-07`: Alle drei entfernen (Duplikate, siehe Abschnitt 2).

**Überarbeiten**
- `q-06-09` (YouTube-Kauf) vs. `q-03-e02`: Eine entfernen; die in der passenden Kategorie behalten.

**Behalten (Highlights)**
- `q-06-03` (Kanye-Logik VMAs): Excellente Logik-Frage mit Partyvalenz.
- `q-06-e01-efc82aae93` oder `q-06-07` (Britney 55h): Einer davon – nicht beide.
- `q-06-06` (Majority-Guess: schlimmste 2000er-Accessoires): Partymoment.

---

### Kategorie: cat-07 – Gaming-Frust & Pixel-Nostalgie

**Überblick**
- Fragenanzahl: 42
- Fragetypen: multiple_choice (9), estimate (6), ranking (3), standard (5), logic (7), common_mistake (3), majority_guess (3), pattern (2), fast_guess (2), sudden_death_estimate (2)
- Durchschnittliche Qualität: 7/10
- Risiko für Spielabend: **niedrig**

**Stärken**
- Beste Kategoriebalance im gesamten Katalog: logic, ranking, majority_guess, estimate – alle sinnvoll eingesetzt.
- Logic-Fragen (Minesweeper-Logik, Pokémon-Typen-Fehler, Tetris-Strategiefragen) sind echte Denksportmomente.
- `q-07-e02` (Game Boy Verkaufszahlen 118,7 Mio.) und `q-07-e03` (40 Mio. Tamagotchis) sind gute Schätzmomente.
- Common Mistakes (z.B. Anti-Piracy-Screen oder Luigi-/Link-Verwechslungen) sind exzellent.

**Hauptprobleme**
- **4 Estimate-Fragen fehlt das `context`-Feld** (`q-07-07`, `q-07-20`, `q-07-28`, `q-07-30`) – sie nutzen `answer.canonical` als Fallback, das nur die Zahl wiederholt, keine echte Erklärung ist.
- `q-07-07` (Game Boy wiegt 300g): Faktisch unsicher, ohne/mit Batterien-Angabe fehlt.
- `q-07-09` (173 Zeichen Prompt: PS2-Startton-Erkennung): Sehr langer Prompt. Auf TV schwer lesbar.

**Kritische Fixes**
- `q-07-07`, `q-07-20`, `q-07-28`, `q-07-30`: `context`-Feld mit echten Erklärungen befüllen (nicht nur Zahl wiederholen).
- `q-07-07`: Spezifizieren ob mit oder ohne Batterien.

**Überarbeiten**
- `q-07-09` (PS2-Ton-Erkennung): Prompt kürzen auf <120 Zeichen.

**Behalten (Highlights)**
- `q-07-02` (Minesweeper-Logik): Top-Frage.
- `q-07-08` (Pokémon Typ-Exploit-Bug): Excellent für Hardcore-Gamer.
- `q-07-14` (Link wird als Mario bezeichnet): Bester common-mistake im gesamten Katalog.
- `q-07-23` (GTA-Cheat-Code erkennen): Sofortiger Partyjubel.
- Alle 3 Majority-Guess Fragen in cat-07 sind spielerisch stark.

---

### Kategorie: cat-08 – Musikalische Jugendsünden & Emo-Phasen

**Überblick**
- Fragenanzahl: 43
- Fragetypen: multiple_choice (25), estimate (5), ranking (2), pattern (1), common_mistake (2), majority_guess (1), logic (3), estimate_duel (1), standard (1), fast_guess (1), sudden_death_estimate (1)
- Durchschnittliche Qualität: 6/10
- Risiko für Spielabend: **mittel**

**Stärken**
- Thematisch perfekt für die Zielgruppe (Crazy Frog, Schnappi, Emo-Phase, VIVA, Autotune).
- `q-08-03` (MCR Piano-Intro erkennen) ist Partymoment, aber 192-Zeichen-Prompt auf TV unlesbar.
- `q-08-e02` (Sandstorm BPM 136) ist eine gute Schätzfrage – schätzbar mit Bauchgefühl.

**Hauptprobleme**
- **Duplikat**: `q-08-e03` und `q-08-12` (VIVA 2018) – beide entfernen bis auf eine.
- **7 Fragen mit Prompts >150 Zeichen** – darunter einige mit >180 Zeichen.
  - `q-08-11` (205 Zeichen: Avril Lavigne Text-Analyse): Auf dem TV nicht lesbar, zu akademisch für Party.
  - `q-08-14` (195 Zeichen: BSB-Analyse warum sie keine Antwort geben): Sehr lang, wirkt wie eine Klausurfrage.
  - `q-08-06` (182 Zeichen: Boyband-Archetyp-Lehre): Interessant, aber zu akademisch für 30 Sekunden.
- **4 Estimate-Fragen fehlt `context`-Feld** (`q-08-01`, `q-08-07`, `q-08-12`, `q-08-15`).
- `q-08-25` (Autotune): Option „Verursachte wissenschaftlich belegte Kopfschmerzen" ist untauglicher Distraktor.

**Kritische Fixes**
- `q-08-e03-aac1454a8b`: Entfernen (Duplikat zu `q-08-12`).
- `q-08-11` und `q-08-14`: Entfernen oder radikal kürzen – als Party-Quizfragen nicht spielbar.

**Überarbeiten**
- `q-08-06` (Boyband-Archetyp): Prompt auf <100 Zeichen kürzen, Essenz erhalten.
- `q-08-03` (MCR-Intro): Prompt kürzen; das Konzept ist stark, der Text zu lang.
- `q-08-25`: Distraktoren ersetzen.
- `q-08-01`, `q-08-07`, `q-08-15`: `context`-Felder ergänzen.

**Behalten (Highlights)**
- `q-08-e02` (Sandstorm BPM = 136): Partymoment.
- `q-08-09` (Aserejé-Text): Sofortiger Nostalgiemoment.
- `q-08-02` (Ranking Boybands nach Gründungsjahr): Gut spielbar, weil diskutierbar.

---

### Kategorie: cat-09 – Gefährliches Halbwissen für Erwachsene (Adulting Fails)

**Überblick**
- Fragenanzahl: 55
- Fragetypen: multiple_choice (27), estimate (10), majority_guess (4), logic (3), ranking (3), common_mistake (3), fast_guess (2), pattern (1), standard (2)
- Durchschnittliche Qualität: 6/10
- Risiko für Spielabend: **mittel**

**Stärken**
- Thema passt perfekt zur Zielgruppe 28–35-Jährige (Steuern, Haushalt, Mülltrennung, Mietrecht).
- Majority-Guess Fragen sind hervorragende Diskussionsmomente.
- `q-09-24` (Arbeitnehmer-Pauschbetrag 1.230 €) ist gutes Adulting-Wissen.

**Hauptprobleme**
- **3 Ranking-Fragen über Lebensmittel** (`q-09-13` Kalorien, `q-09-19` CO2, `q-09-10` Pfand) – alle nach Wert sortieren, monotone Struktur. Eines davon sollte entfernt werden.
- **3 Schätzfragen sind Rechenaufgaben** (`q-09-10`, `q-09-18`, `q-05-24`): Kein echter Schätzmoment – berechenbar.
- `q-09-03` (Mietvertrags-Mathe, 202 Zeichen): Auf TV nicht lesbar, zu komplex für 30 Sekunden.
- `q-09-17` (132 Zeichen, 20%-mehr-Inhalt-Logik): Rechenaufgabe als Schätzfrage getarnt.

**Kritische Fixes**
- `q-09-03` (202 Zeichen Mietvertrags-Mathe): Radikal kürzen oder entfernen. Als Partyquiz-Frage unspielbar.

**Überarbeiten**
- `q-09-10`, `q-09-18`: Als logic-Fragen reformulieren (multiple_choice mit korrekter Rechnung als Antwort).
- `q-09-13` oder `q-09-19`: Eine der Lebensmittel-Sortier-Fragen entfernen.
- `q-09-19`: CO2-Ranking mit Tieren (Haehnchen, Schwein, Kaese, Rindfleisch) – korrekte Reihenfolge nachprüfen. Im Prompt steht „von niedrig nach hoch" – die canonical_order müsste entsprechend aufsteigend sortiert sein.

**Behalten (Highlights)**
- `q-09-24` (Arbeitnehmer-Pauschbetrag): Echter Erwachsenen-Wissensmoment.
- `q-09-05` (Pizzakarton ins Altpapier): Klassischer Adulting-Fail.
- `q-09-07` (Waschsymbol): Schnell, visuell, alle kennen das Problem.

---

### Kategorie: cat-10 – Technik-Fails & Hardware-Friedhof

**Überblick**
- Fragenanzahl: 43
- Fragetypen: multiple_choice (26), estimate (4), ranking (2), standard (2), logic (2), common_mistake (2), majority_guess (2), fast_guess (1), pattern (1), estimate_duel (1)
- Durchschnittliche Qualität: 7/10
- Risiko für Spielabend: **niedrig**

**Stärken**
- Starke Nostalgie-Fragen (Disketten, Nokia, Napster, Windows XP, Clippy).
- Estimate-Fragen sind gut schätzbar (Nokia 3310 Standby 260h, LAN-Party Monitor 22kg).
- `q-10-12` (Napster-Download-Zeit) ist ein exzellenter Schätzmoment mit Nostalgie-Faktor.
- `q-10-23` (GTA-Cheat-Code) – wenn hier auch, sofortiger Partyjubel.

**Hauptprobleme**
- **4 Fragen mit Prompts >150 Zeichen** (`q-10-02`, `q-10-05`, `q-10-07`, `q-10-11`, `q-10-12`).
  - `q-10-11` (221 Zeichen!): Der längste Prompt im gesamten Katalog. Auf TV absolut unlesbar.
- `q-10-07` (LAN-Party Monitor 22kg): Das `context`-Feld ist eine Anekdote statt echtem Kontext.

**Kritische Fixes**
- `q-10-11` (221 Zeichen): Sofort kürzen oder entfernen. Kein Spieler liest das in 30 Sekunden.

**Überarbeiten**
- `q-10-02` (Nokia 3310 Standby): Prompt kürzen. Die Beschreibung „Kakerlake unter den Handys" etc. kann in die Erklärung.
- `q-10-05` (USB Safe Remove): Prompt kürzen. Essenz: „Was passiert technisch, wenn man USB ohne Auswerfen abzieht?"

**Behalten (Highlights)**
- `q-10-12` (Napster Download-Zeit 8 Min): Excellent.
- `q-10-08` (Clippy): Nostalgischer Sofort-Lacher.
- `q-10-04` (Ranking Speichermedien nach Kapazität): Gut spielbar, klare Reihenfolge.

---

## 6. Spielabend-Tauglichkeit

### Stimmungskiller

- `q-08-11` [cat-08] (205 Zeichen, Avril Lavigne Text-Analyse): Zu lang, zu akademisch. Niemand liest das in 30 Sekunden.
  - Empfehlung: **remove**
- `q-10-11` [cat-10] (221 Zeichen, Handy-Evolution): Längster Prompt im Katalog. Unspielbar auf TV.
  - Empfehlung: **remove**
- `q-09-03` [cat-09] (202 Zeichen, Mietvertrags-Mathe): Zu komplex für Party-Feeling.
  - Empfehlung: **remove**
- `q-08-14` [cat-08] (195 Zeichen, BSB-Analyse): Klausurfrage, kein Partymoment.
  - Empfehlung: **remove** oder auf <80 Zeichen kürzen
- `q-04-05-mistake-alm` [cat-04] (213 Zeichen): Viel zu lang.
  - Empfehlung: **revise** (Prompt auf <100 Zeichen kürzen)

### Zu lang fürs Display

**Faustregel: >120 Zeichen ist grenzwertig, >150 Zeichen ist schlecht, >180 Zeichen ist unspielbar.**

73 Fragen haben Prompts >120 Zeichen. Kritischste Fälle (>180 Zeichen):
- `q-10-11`: 221 Zeichen → Entfernen
- `q-09-03`: 202 Zeichen → Entfernen
- `q-08-11`: 205 Zeichen → Entfernen
- `q-04-05-mistake-alm`: 213 Zeichen → Kürzen
- `q-08-06`: 182 Zeichen → Kürzen: „Welchem Boyband-Archetyp gehörst du an?"
- `q-08-14`: 195 Zeichen → Entfernen
- `q-08-03`: 192 Zeichen → Kürzen: Essenz ist „Welches Lied von MCR beginnt so?" + Prompt-Anfang
- `q-05-05`: 189 Zeichen → Kürzen: Rechenaufgabe in Multiple-Choice-Format umbauen

### Gute Partyfragen

- `q-07-23` [cat-07] (GTA-Cheatcode: R1, R2, L1, X…): Sofortiger Jubel.
- `q-06-03` [cat-06] (Kanye-Logik VMAs): Diskussionsmoment.
- `q-08-09` [cat-08] (Aserejé-Text): Alle singen es laut mit.
- `q-01-08` [cat-01] (Majority-Guess: nervigster HP-Charakter im Auto): Lacher garantiert.
- `q-04-06-majority-shame` [cat-04] (schlimmster TV-Tiefpunkt 2000er): Diskussionsmoment.
- `q-02-04` [cat-02] (WAP-Bedeutung): Klar, kurz, alle wissen es – trotzdem lustig laut.
- `q-05-11` [cat-05] (Fahrrad-Promille-Grenze): Überraschungswert für viele.
- `q-10-12` [cat-10] (Napster-Download 8 Minuten): Nostalgie-Schätzmoment.

---

## 7. Priorisierte Fixliste

### P0 – Muss vor dem Abend behoben werden

1. **Duplikate cat-01 entfernen** (8 Fragen): `q-01-10-new`, `q-01-11-346e4e40a0`, `q-01-21-89c1ef5e21`, `q-01-e02-0ed6866105`, `q-01-e03-a6553820f8`, `q-01-12-d56fa12b3e`, `q-01-13-28324b61c1`, `q-01-17`
2. **Duplikate andere Kategorien** (5 Fragen): `q-06-10`, `q-06-14`, `q-06-07`, `q-08-e03-aac1454a8b`, `q-05-e02-4d430361dd`
3. **Unspielbare Prompts entfernen** (4 Fragen): `q-10-11`, `q-09-03`, `q-08-11`, `q-08-14`
4. **Faktenfehler `q-01-17`**: Bereits in P0-Duplikat-Liste. Falls behalten: Prompt auf „alle Treppen" ändern.

### P1 – Sollte behoben werden

5. **Langen Prompts kürzen** (mind. 10 Fragen >180 Zeichen): `q-04-05-mistake-alm`, `q-08-03`, `q-08-06`, `q-05-05`, `q-05-16`, `q-04-03-logic-kader`
6. **Distraktoren mit Längen-Leak reparieren** (top 5): `q-01-19-fd285a0207`, `q-09-19-be189a5f35`, `q-10-07-c46b85b036`, `q-10-25-258ab2b479`, `q-08-13-3356a1a3b7`
7. **Estimate-context-Felder ergänzen** (8 Fragen): `q-07-07`, `q-07-20`, `q-07-28`, `q-07-30`, `q-08-01`, `q-08-07`, `q-08-12`, `q-08-15`
8. **YouTube-Kauf-Duplikat** (`q-03-e02` vs. `q-06-09`): Eine entfernen
9. **Rechenaufgaben als Schätzfragen** reformulieren: `q-09-10`, `q-09-18`, `q-05-24`

### P2 – Nice to have

10. `q-03-e01` (MySpace-Zahl) faktisch nachprüfen
11. `q-08-e01` (Dragostea Din Tei 14 Wochen) faktisch nachprüfen
12. `q-07-07` (Game Boy Gewicht): mit/ohne Batterien klarstellen
13. `q-01-10` (Snape Fan-Deutung): als Majority-Guess reformulieren
14. Schlechte Distraktoren ersetzen: `q-08-25` (Autotune-Kopfschmerzen), `q-02-01` (Dinkel-Sauerteig)
15. Eine der 3 cat-09 Lebensmittel-Ranking-Fragen streichen
16. `q-04-10-logic-gerner` (GZSZ-Hochzeiten): zu nischig, streichen oder breiter machen

---

## 8. Review-State-Vorschlag

```json
{
  "q-01-10-new": {
    "status": "remove",
    "note": "Exaktes Duplikat zu q-01-07 (Moody/Barty Crouch Jr. Zungenzeigen). q-01-07 hat bessere Distraktoren."
  },
  "q-01-11-346e4e40a0": {
    "status": "remove",
    "note": "Exaktes Duplikat zu q-01-13 (Luna Lovegood Löwenkopf). q-01-13 bleibt."
  },
  "q-01-17": {
    "status": "remove",
    "note": "Faktenfehler: Prompt fragt nach 'bewegliche Treppen' = 142, aber 142 ist die Gesamtzahl aller Treppen. Außerdem Duplikat zu q-01-e01. Entfernen."
  },
  "q-01-21-89c1ef5e21": {
    "status": "remove",
    "note": "Exaktes Duplikat zu q-01-19 (Snapes Patronus Hirschkuh). q-01-19 bleibt."
  },
  "q-01-e02-0ed6866105": {
    "status": "remove",
    "note": "Duplikat zu q-01-24: HP1 Produktionsbudget 125M USD. Gleicher Fakt, gleicher Wert."
  },
  "q-01-e03-a6553820f8": {
    "status": "remove",
    "note": "Duplikat zu q-01-23: DH2 Box Office 1342M USD. Gleicher Fakt, gleicher Wert."
  },
  "q-01-12-d56fa12b3e": {
    "status": "remove",
    "note": "Duplikat zu q-01-15: Slughorn verschüttet Wein in Hagrids Hütte. q-01-15 bleibt."
  },
  "q-01-13-28324b61c1": {
    "status": "remove",
    "note": "Duplikat zu q-01-18: Blut als Opfer für Horkrux-Höhle. q-01-18 bleibt."
  },
  "q-01-19-fd285a0207": {
    "status": "revise",
    "note": "Längen-Leak: Richtige Antwort (37 Zeichen) ~3x länger als alle Distraktoren (~12 Zeichen). Distraktoren auf ähnliche Länge bringen."
  },
  "q-05-e02-4d430361dd": {
    "status": "remove",
    "note": "Duplikat zu q-05-08: Beide fragen nach Zucker in Red Bull 250ml = 27,5g. q-05-08 bleibt."
  },
  "q-06-07": {
    "status": "remove",
    "note": "Duplikat zu q-06-e01-efc82aae93: Britney Spears Las-Vegas-Ehe 55 Stunden. q-06-e01 bleibt (neutralerer Prompt)."
  },
  "q-06-10": {
    "status": "remove",
    "note": "Duplikat zu q-06-05-255c734412: Paris Hilton als 'Urmutter der It-Girls'. q-06-05 bleibt."
  },
  "q-06-14": {
    "status": "remove",
    "note": "Duplikat zu q-06-12-4ae5daa5e8: Typisches Merkmal der Emo-Welle 2000er. q-06-12 bleibt."
  },
  "q-08-e03-aac1454a8b": {
    "status": "remove",
    "note": "Duplikat zu q-08-12: VIVA-Einstellungsjahr 2018. q-08-12 hat vollständigeren Kontext im Prompt."
  },
  "q-08-11": {
    "status": "remove",
    "note": "Prompt 205 Zeichen (Avril Lavigne Text-Analyse). Auf TV nicht lesbar, zu akademisch für Partyquiz."
  },
  "q-08-14": {
    "status": "remove",
    "note": "Prompt 195 Zeichen (BSB-Songtext-Analyse). Klausurformat, kein Partymoment."
  },
  "q-08-25-efd407f660": {
    "status": "revise",
    "note": "Distraktor 'Verursachte wissenschaftlich belegte Kopfschmerzen' ist zu absurd, macht richtige Antwort durch Ausschluss offensichtlich. Durch plausibleren Distraktor ersetzen."
  },
  "q-09-03": {
    "status": "remove",
    "note": "Prompt 202 Zeichen (Mietvertrags-Mathe). Auf TV unlesbar, zu komplex für 30 Sekunden Spielzeit."
  },
  "q-09-10": {
    "status": "revise",
    "note": "Keine echte Schätzfrage – berechenbar (20 × 0,08 € + 1,50 €). Als logic-Frage mit MC-Optionen reformulieren."
  },
  "q-09-18": {
    "status": "revise",
    "note": "Keine echte Schätzfrage – berechenbar (20 × 0,5L = 10L). Als logic-Frage reformulieren oder entfernen."
  },
  "q-10-07-c46b85b036": {
    "status": "revise",
    "note": "Längen-Leak: Richtige Antwort '1,44 Megabyte' (36 Zeichen) vs. Einzelwort-Distraktoren (~6 Zeichen). Distraktoren verlängern."
  },
  "q-10-11": {
    "status": "remove",
    "note": "Prompt 221 Zeichen – längster Prompt im gesamten Katalog. Auf TV absolut unlesbar, unspielbar."
  },
  "q-03-e01-b4f45030f1": {
    "status": "revise",
    "note": "MySpace Peak 75,9 Mio. faktisch unsicher (tatsächlicher Peak könnte höher gewesen sein). Recherche nötig oder Zahl anpassen."
  },
  "q-07-07": {
    "status": "revise",
    "note": "Game Boy wiegt 300g – unklar ob mit oder ohne Batterien. Mit 4x AA ≈ 390g. Prompt präzisieren. context-Feld ergänzen."
  },
  "q-04-05-mistake-alm": {
    "status": "revise",
    "note": "Prompt 213 Zeichen – zu lang für TV. Auf <100 Zeichen kürzen: 'Was hat das Genre der ekligen Promi-TV-Prüfungen in Deutschland wirklich erfunden?'"
  },
  "q-08-03": {
    "status": "revise",
    "note": "Prompt 192 Zeichen – zu lang für TV. Essenz behalten: 'Welches Lied von MCR erkennst du an diesen ersten Klaviernoten?' + abgekürzte Beschreibung."
  }
}
```

---

## Abschlussbewertung

Der Fragenkatalog ist **bedingt spielbar**. Die Grundsubstanz ist solid – die Themen sind für eine Millennial-Runde perfekt, die Stimmungsmomente sind vorhanden, und viele Fragen werden echte Lacher und Diskussionen auslösen.

**Das zentrale Problem ist strukturell, nicht inhaltlich**: Beide Katalogdateien füllen dieselben Kategorien. Das bedeutet, cat-01 hat 50 Fragen statt 25 – und 8 davon sind direkte Duplikate desselben Fakts. Wer „Schnappi Schnappi Schnappi" zweimal in einem Abend hört oder zweimal nach Snapes Patronus gefragt wird, verliert das Vertrauen in den Spielleiter.

**Dazu kommen 73 Fragen mit Prompts über 120 Zeichen**, von denen 8 über 180 Zeichen lang sind. Auf einem TV-Display in 20–40 Sekunden lesbar: unmöglich. Diese Fragen töten das Tempo.

**Was sofort passieren muss** (P0): 18 Fragen streichen – 13 Duplikate und 4 Stimmungskiller durch Länge. Das ist 4 Minuten Arbeit im Review-Tool, aber entscheidend für den Abend.

**Was den Abend retten wird**, wenn das passiert: Cat-02 (Sextalk), cat-03 (Internet-Nostalgie), cat-07 (Gaming) und die Majority-Guess-Fragen quer durch alle Kategorien. Das ist hochwertiges Partymaterial.

**Ehrliches Fazit**: Ohne die P0-Fixes ist cat-01 ein Desaster (50 Fragen, 8 Duplikate). Mit den P0-Fixes: ein vollwertiger, stimmungsvoller Quizabend. Die Qualität des kreativen Inhalts rechtfertigt die nötige Bereinigung.
