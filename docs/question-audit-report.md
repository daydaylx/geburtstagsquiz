# Fragenkatalog-Audit – Geburtstagsquiz

> Erstellt: 2026-05-03 · Basis: v4 (220 Fragen) + v5 (282 Fragen) = 502 gesamt

---

## Kurzfazit

|                                   |                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gesamtqualität**                | 7 / 10                                                                                                                                                           |
| **Spielbar im aktuellen Zustand** | ja (eingeschränkt – bestimmte Kategorien und V5-Prompts)                                                                                                         |
| **Kritische Schemafehler**        | 3                                                                                                                                                                |
| **Entfernen empfohlen**           | 5                                                                                                                                                                |
| **Überarbeiten empfohlen**        | 26                                                                                                                                                               |
| **Größtes Risiko**                | Lange V5-Prompts werden auf TV-Display abgeschnitten; 1 Faktenfehler in gespielter Estimate-Frage (PS1 Memory Card); cat-07 Gaming zu niche für gemischte Gruppe |

**Kernaussage:** Der Katalog ist spielbereit – alle 502 Fragen laden ohne Fehler. V4 ist robust. V5 bringt gute Fragetypen (Logic, Estimate, Majority-Guess, Ranking) hinzu, hat aber 14 Prompts die das TV-Display-Limit (~150 Zeichen) sprengen und drei Fragen mit strukturellen Eigenheiten. Cat-03, Cat-05, Cat-08 und Cat-09 sind partytauglich. Cat-01 und Cat-07 polarisieren.

---

## Gefundene Fragenquellen

| Datei                                                          |  Fragen | Ladefehlerfrei | Kategorien               |
| -------------------------------------------------------------- | ------: | -------------- | ------------------------ |
| `geburtstagsquiz_millennials_engine_v4_release_candidate.json` |     220 | ja (100 %)     | cat-01..10 (cat-02 leer) |
| `geburtstagsquiz_millennials_engine_v5_expanded.json`          |     282 | ja (100 %)     | cat-01..10               |
| **Kombiniert**                                                 | **502** | **ja**         |                          |

### Fragetyp-Verteilung nach Ladezeit

`quiz-data.ts` verwendet Shape-Detection (keine Type-String-Prüfung), daher laden alle Fragen – auch solche mit Nicht-Schema-Typen wie `standard`, `common_mistake`, `fast_guess`, `pattern`, `estimate_duel`, `sudden_death_estimate`. Diese werden anhand ihrer Felder automatisch auf unterstützte Typen gemappt:

| Typ im JSON             | Lädt als       |  Anzahl |
| ----------------------- | -------------- | ------: |
| `multiple_choice`       | MultipleChoice |     272 |
| `standard`              | MultipleChoice |      47 |
| `logic`                 | Logic          |      30 |
| `common_mistake`        | MultipleChoice |      20 |
| `fast_guess`            | MultipleChoice |      13 |
| `pattern`               | MultipleChoice |      12 |
| `estimate`              | Estimate       |      25 |
| `estimate_duel`         | Estimate       |       7 |
| `sudden_death_estimate` | Estimate       |       8 |
| `ranking`               | Ranking        |      21 |
| `majority_guess`        | MajorityGuess  |      18 |
| **Gesamt**              |                | **502** |

---

## Schema-Probleme

### P0 – Kritisch

**[q-07-e01-9ce9e570a8]** Faktenfehler im Estimate-Referenzwert

- Datei: v4, cat-07
- Problem: `reference_value: 1` (MB) – die PS1 Memory Card hatte 128 KB = 0,125 MB, nicht 1 MB. Wer auch nur vage Hardware-Kenntnisse hat, wird laut protestieren.
- Risiko: Spiel akzeptiert „1" als nächste Antwort, obwohl 0,125 die richtige wäre. Eskalation beim Reveal garantiert.
- Fix: `reference_value: 0.125`, `unit: "MB"`, `canonical: "0.125 MB (128 KB)"` – oder Frage ganz entfernen.

**[q-10-03]** Logic ohne Optionen → lädt als OpenText

- Datei: v5, cat-10
- Problem: Frage hat keine `options`-Array und kein `reference_value`, aber `answer.canonical: "Sie drosselte die Geschwindigkeit"`. Wird als `open_text` geladen. Spieler tippen die Antwort frei auf dem Handy – an einer Party ein Spielfluss-Killer.
- Fix: Optionen hinzufügen: A) Sie beschleunigte den PC, B) Sie drosselte die CPU-Taktrate, C) Sie deaktivierte den L2-Cache, D) Sie aktivierte den Overclock-Modus → Typ `multiple_choice` wird korrekt erkannt.

**[q-10-10]** Logic ohne Optionen → lädt als OpenText

- Datei: v5, cat-10
- Problem: Identisch wie q-10-03. Frage zu Anti-Shock-Discman (`answer.canonical: "Der digitale Zwischenspeicher ist leer gelaufen"`). Freitext-Eingabe auf Party-Handys ist unakzeptabel.
- Fix: Optionen hinzufügen: A) Der CD-Laser überhitzt, B) Der digitale Puffer ist leer gelaufen, C) Der Motor dreht sich zu langsam, D) Die Batterien sind schwach.

### P1 – Ranking-Items als Strings statt Objekte

**[q-04-04-ranking-starts]** und **[q-04-19-ranking-trash]**

- Datei: v5, cat-04
- Problem: `items`-Array enthält Plain-Strings statt `{ id, label }`-Objekte. Lädt dank Label-Matching in `toRankingQuestion` korrekt, aber die Struktur weicht vom Schema ab.
- Risiko: kein Laufzeitfehler, aber fragil bei Schema-Änderungen.
- Fix: Items in `{ "id": "A", "label": "Big Brother (RTL II)" }` umwandeln.

---

## Kategorieberichte

### cat-01 – Harry Potter (Nur Filme, harter Schwierigkeitsgrad)

- Spielbare Fragen: 25 (v4) + 11 (v5) = 36 gesamt, 33 nach Duplikat-Bereinigung
- Qualität: 6 / 10
- Hauptprobleme:
  - Schwierigkeitsniveau für Partygruppe zu hoch (Filmdetail-Trivia statt Hauptplot)
  - Menschen die Harry Potter aktiv ablehnen, werden diese Kategorie sabotieren
  - Zwei Fragen benutzen Bücher-Canon obwohl Kategorie „Nur Filme" verspricht

- Entfernen:
  - [q-01-07] Duplikat von q-01-10-new (v4); selber Prompt, v4-Version behalten
  - [q-01-19] Duplikat von q-01-21-89c1ef5e21 (v4); identischer Prompt
  - [q-01-23] Duplikat von q-01-e03-a6553820f8 (v4); identischer Prompt

- Überarbeiten:
  - [q-01-e01-c564fe35e2] „142 Treppen in Hogwarts" – Bücher-Canon, nicht aus Filmen ableitbar. Prompt anpassen: „laut Buch/Film" oder Frage ersetzen.
  - [q-01-e03-a6553820f8] Prompt 131 Zeichen – an TV-Limit. Kürzen: „Wie viel Mio. USD spielte HP7 Teil 2 weltweit ein?"
  - [q-01-05] (v5) Screen-Time Voldemort in Minuten – komplett unschätzbar ohne Recherche. Als Estimate untauglich; zu MC umbauen oder entfernen.

- Gute Fragen:
  - [q-01-16-9be43fbe7e] Snapes Spitznamen-Frage: knackig, klare Antwort, auch für Nicht-Hardcore-Fans lösbar
  - [q-01-21-89c1ef5e21] Snape-Patronus (Hirschkuh): ikonische Filmszene, universell bekannt

---

### cat-02 – Sex, Liebe & expliziter Bullshit

- Spielbare Fragen: 0 (v4!) + 79 (v5) = 79 gesamt
- Qualität: 7 / 10
- Hauptprobleme:
  - In V4 komplett leer – wer nur V4 hat, sieht diese Kategorie nie
  - 79 Fragen sind zu viele; in einem normalen Spiel kommen kaum alle vor → kein Problem in der Praxis
  - Zwei Fragen behandeln ähnliche BDSM-Themen (q-02-01-c95a802a2d, q-02-new-36-bdsm); wenn zufällig beide gezogen werden: Déjà-vu

- Überarbeiten:
  - [q-02-new-35-sugar-daddy] Optionen unterschiedlich lang (1 Satz vs. 2 Wörter) – richtige Antwort telegrafiert sich selbst. Optionen angleichen.

- Gute Fragen: Die meisten MC-Fragen in cat-02 sind direkt, haben plausible Distraktoren und erzeugen garantiert Reaktionen. Solide Kategorie für Erwachsenenabend.

---

### cat-03 – Cringe Millennial-Slang & Internet-Fossilien

- Spielbare Fragen: 29 (v4) + 8 (v5) = 37
- Qualität: 8 / 10
- Hauptprobleme:
  - Drei Abkürzungsfragen (YOLO, ROFL, OMG) zu offensichtlich – kein echter Rätselcharakter
  - Estimate Google-YouTube-Preis: USD vs. EUR unscharf formuliert

- Entfernen: (keine P0)

- Überarbeiten:
  - [q-03-11-75e907ba1d] YOLO: zu offensichtlich für Zielgruppe. Distraktoren absurd genug, dass niemand überlegt. P2-optional.
  - [q-03-18-765fd501f3] ROFL: selbe Problematik. P2-optional.
  - [q-03-24-9736e71b53] OMG: selbe Problematik. P2-optional.
  - [q-03-e02-cb56fcabf0] Google-YouTube-Preis: „1310 Millionen Euro" korrekt (Kurs 2006), aber der publik kommunizierte Preis war „1,65 Milliarden Dollar". Erklärungs-Text sollte beide Währungen nennen, damit kein Streit entsteht.

- Gute Fragen:
  - [q-03-01-e7d3b9014a] SchülerVZ Frage: universelle Millennial-PTSD, kurze klare Antwort
  - [q-03-20-7a5a6c1b9f] Kettenbrief-Frage: spontanes kollektives Lachen garantiert
  - [q-03-mac9aa73df0] Ranking Chat-Apps nach Release (ICQ/WhatsApp/Telegram/Signal): faktisch klar, lehrreich

---

### cat-04 – 90er/00er Trash-TV & kollektives Trauma

- Spielbare Fragen: 13 (v4) + 10 (v5) = 23
- Qualität: 7 / 10
- Hauptprobleme:
  - V5-Prompts systematisch zu lang (6 Fragen > 145 Zeichen) → TV-Display schneidet ab
  - GZSZ/Kader-Loth-Fragen sehr niche – nur für intensive RTL2-Konsumenten
  - Negativ-Frage (q-04-25) mit problematischem Subtext (Willi Herren, verstorben 2021)

- Überarbeiten:
  - [q-04-03-logic-kader] (v5) Prompt 181 Zeichen → kürzen auf max. 120 Zeichen
  - [q-04-09-estimate-jamba] (v5) Prompt 129 Zeichen → kürzen
  - [q-04-10-logic-gerner] (v5) Prompt 178 Zeichen → kürzen
  - [q-04-25-logic-jungle] (v5) Prompt 155 Zeichen + Negativfrage-Formulierung + Willi-Herren-Subtext → komplett überarbeiten oder entfernen
  - [q-04-e01] (v5) Prompt 159 Zeichen → kürzen
  - [q-04-e02] (v5) Prompt 145 Zeichen → kürzen
  - [q-04-05-9e64f181f0] „Günther Jauch bei Wer wird Millionär" – zu offensichtlich. P2-optional.

- Gute Fragen:
  - [q-04-19-ranking-trash] Trash-Ikonen nach TV-Debüt: funktioniert, sorgt für „Warte, Zlatko war vor Kader Loth?"-Momente
  - [q-04-06-e5f2a59fd1] „Was musste man bei Bauer sucht Frau tun?" – klare Antwort, universeller Wiedererkennungswert

---

### cat-05 – Saufen, Feiern & toxische Jugend-Drinks

- Spielbare Fragen: 28 (v4) + 12 (v5) = 40
- Qualität: 8 / 10
- Hauptprobleme:
  - Eine Frage mit mehreren vertretbaren richtigen Antworten (Leichen)
  - Longdrink-Definition faktisch ungenau
  - V5-Logic-Fragen mit Rechenaufgaben und >180-Zeichen-Prompts

- Überarbeiten:
  - [q-05-06-69a36d4f74] „Leichen nach der Party" – Antwort „eingeschlafene Betrunkene" ODER „leere Flaschen" beides gängig. Prompt klären oder andere Antwort wählen.
  - [q-05-17-d070806f36] „Longdrink hat nur 2 Zutaten" – zu stark vereinfacht; G&T hat mehr als 2 Zutaten. Formulierung anpassen: „besteht typischerweise aus Spirituose + Mixer (2 Hauptzutaten)".
  - [q-05-05] (v5) Prompt 189 Zeichen, Rechenaufgabe auf Party ohne Stift → kürzen oder zu einfacher MC umwandeln
  - [q-05-16] (v5) Prompt 180 Zeichen, Drei-Freunde-Mathe → kürzen oder vereinfachen

- Gute Fragen:
  - [q-05-03-a6e0bfe5a9] „Was bedeutete Vorglühen wirklich?" – kurz, trifft Millennial-Nerv, klare Antwort
  - Großteil der V4-Fragen in cat-05: knackig, themengerecht, gute Energie

---

### cat-06 – Absurde Skandale & Popkultur-Meltdowns

- Spielbare Fragen: 27 (v4) + 6 (v5) = 33
- Qualität: 8 / 10
- Hauptprobleme:
  - Zwei Fragen mit inhaltlichen Ungenauigkeiten (Aggro Berlin, Y2K)
  - Estimate-Frage kaschiert als Jahreszahl-Wissenstest (Nipplegate)

- Überarbeiten:
  - [q-06-21-db7ae3022f] „Boygroup aus Berlin-Marzahn" → Aggro Berlin war ein Rap-Label, kein Boyband-Projekt; Sido stammt aus Reinickendorf, nicht Marzahn. Prompt und Kontext korrigieren.
  - [q-06-24-bedb3b28b0] „Was war das Ziel des Millennium-Bugs?" → Y2K hatte kein Ziel, es war ein Programmierfehler. Formulierung: „Was war das Kernproblem des Millennium-Bugs?" + Antwortoptionen anpassen.
  - [q-06-e02-cf01d207c2] Nipplegate-Jahr (2004) – als Estimate getarnte Wissensfrage. Kein Schätz-Wert; Jahreszahl ist entweder bekannt oder nicht. Zu MC umbauen.
  - [q-06-25-290a147a5f] „Statussymbol nach Sommerferien" (Eastpak) – sehr subjektiv und regional. Als Majority-Guess sinnvoller als MC.

- Gute Fragen:
  - [q-06-04-09a502d726] Crazy Frog / Jamba: universelle PTSD, kurze Frage, kein Streit
  - [q-06-06-3c6cce0e8c] Numa Numa / Milkshake: Nostalgie pur
  - [q-06-e01-ab6c6f6219] Napster-Nutzerzahlen: Estimate mit echter Schätz-Dynamik

---

### cat-07 – Gaming-Frust & Pixel-Nostalgie

- Spielbare Fragen: 12 (v4) + 16 (v5) = 28
- Qualität: 6 / 10
- Hauptprobleme:
  - 1 klarer Faktenfehler (PS1 Memory Card)
  - Mehrere Fragen nur für Hardcore-Gamer lösbar (Monkey Island, Minesweeper-Logik, Gen-1-Pokémon-Glitch)
  - „Carmen Sandiego" sehr US-spezifisch, deutsche Millennials kennen es kaum
  - Eine Frage (Konsole mit Anblasen) hat multiple korrekte Antworten

- Entfernen:
  - [q-07-e01-9ce9e570a8] PS1 Memory Card = 1 MB → **FAKTENFEHLER** (tatsächlich 128 KB). Wer es weiß, eskaliert. Frage entfernen oder `reference_value: 0.125` + korrektes `canonical` setzen.

- Überarbeiten:
  - [q-07-07-508618c674] „Welche Konsole nutzte Cartridges und Anblasen?" → mehrere Antworten möglich (NES, SNES, N64). Frage auf eine spezifische Konsole präzisieren.
  - [q-07-17-890823bbb8] „Carmen Sandiego" → sehr US-spezifisch. Für deutsches Publikum ersetzen.
  - [q-07-22-d683609ad9] „Nutzen des Fahrrads in Pokémon Rot/Blau" → zu trivial für jede Pokémon-Kennerin. P2-optional.
  - [q-07-08] (v5) Pokémon Gen-1 Psycho-Immun-Glitch → maximale Nerd-Nische. P2-optional.

- Gute Fragen:
  - [q-07-15] (v5) Pac-Man Level 256 Kill Screen → Wow-Effekt für die die es wissen, trotzdem zugänglich genug
  - [q-07-02] (v5) Minesweeper-Logik → spaßige Logikaufgabe, obwohl niche

---

### cat-08 – Musikalische Jugendsünden & Emo-Phasen

- Spielbare Fragen: 28 (v4) + 8 (v5) = 36
- Qualität: 9 / 10
- Hauptprobleme:
  - V5-Prompts durchgehend zu lang (3 Fragen > 180 Zeichen)
  - 2 Estimate-Fragen sind Wissensfragen (VIVA-Einstellung, BPM Sandstorm)

- Überarbeiten:
  - [q-08-01] (v5) Schnappi-Prompt 165 Zeichen → kürzen auf „Wie viele Wochen stand Schnappi in Deutschland auf Platz 1?"
  - [q-08-06] (v5) Boyband-Archetyp-Prompt 182 Zeichen → kürzen + „Quotentänzer" ist Meinung, keine Tatsache → umformulieren
  - [q-08-11] (v5) Avril-Lavigne-Logik 205 Zeichen → auf max. 120 Zeichen kürzen
  - [q-08-14] (v5) Backstreet-Boys-Logik 195 Zeichen → kürzen; außerdem Antwort „Klang wichtiger als Textsinn" ist externe Einschätzung, keine belegbare Tatsache
  - [q-08-e02-4ad75bc879] BPM Sandstorm → keine sinnvolle Schätz-Frage, niemand kennt BPMs aus dem Gedächtnis. Zu MC umbauen.
  - [q-08-e03-aac1454a8b] VIVA-Einstellung (Jahr) → Wissensfrage als Estimate getarnt. Zu MC umbauen.
  - [q-08-02-16149da58b] Bill Kaulitz Tokio Hotel → zu offensichtlich. P2-optional.

- Gute Fragen:
  - [q-08-01-26e4ce9fe5] Emo-Pony-Frisur-Funktion: universeller Lacher, kurz, klar
  - [q-08-14-00add44b66] „Welches Lied rettete jeden Schulbus-Trip?" → Nostalgie-Volltreffer
  - Großteil V4-cat-08: beste konsistente Kategorie im Katalog

---

### cat-09 – Gefährliches Halbwissen für Erwachsene (Adulting Fails)

- Spielbare Fragen: 30 (v4) + 17 (v5) = 47
- Qualität: 8 / 10
- Hauptprobleme:
  - Müll-Kategorisierungs-Frage bundesland-abhängig → garantierter Einwand
  - Verneinungsfrage mit konfuser Logik
  - 3 Fragen ohne `explanation`

- Überarbeiten:
  - [q-09-02-731a3c8f32] „Saubere Papierverpackungen in Papiertonne" → je nach Bundesland auch Gelber Sack. Entweder Bundesland benennen oder Frage auf eindeutige Kategorien (Biotonne, Restmüll) beschränken.
  - [q-09-03] (v5) Mietmathe 202 Zeichen + lädt als Estimate → Prompt radikal kürzen: „Kaltmiete 600 €, Nebenkosten 150 €, Strom 80 € direkt an Versorger. Was überweist du an den Vermieter?" + Länge unter 150 Zeichen bringen.
  - [q-09-09] (v5) `explanation` fehlt → Auflösung-Text für Stoßlüften hinzufügen.
  - [q-09-17] (v5) „20% mehr Inhalt gratis" lädt als Estimate (16,6 %) → inhaltlich sehr clever, aber Prompt 202 Zeichen → kürzen.

- Gute Fragen:
  - [q-09-13-d6db023697] Fettbrand mit Wasser löschen (falsch!) → bester Schockmoment des Katalogs, alle haben kurz daran gedacht
  - [q-09-17] (v5) 20%-Inhalt-Mathe-Trick → elegant, lehrreich, echter Aha-Effekt
  - [q-09-08-c8a282d52c] MHD vs. Verbrauchsdatum → praktisch, relevant, klare Antwort

---

### cat-10 – Technik-Fails & Hardware-Friedhof

- Spielbare Fragen: 28 (v4) + 8 (v5) = 36 (effektiv 34 nach Revision)
- Qualität: 7 / 10
- Hauptprobleme:
  - 2 Fragen laden als OpenText → Party-Spielfluss-Killer
  - Mehrere triviale V4-Fragen senken das Niveau
  - V5-Prompts zu lang

- Entfernen / Revise:
  - [q-10-03] (v5) OpenText-Falle → Optionen hinzufügen (siehe Schema-Probleme)
  - [q-10-10] (v5) OpenText-Falle → Optionen hinzufügen (siehe Schema-Probleme)
  - [q-10-25-258ab2b479] „Was war die Kernkompetenz vieler Geräte dieser Ära?" → keine Wissens-, sondern Witzfrage. Kein Mehrwert als Quiz-Frage. Entfernen.
  - [q-10-02] (v5) Nokia-3310-Prompt 166 Zeichen → kürzen auf „Wie viele Stunden Standby bot das Nokia 3310 laut Spec?"
  - [q-10-07] (v5) Röhrenmonitor-Gewicht 169 Zeichen → kürzen
  - [q-10-09-d59a3ca39c] SMS = Short Message Service → zu trivial. P2-optional.
  - [q-10-15-22894dcb08] USB-Stick-Definition → zu trivial. P2-optional.

- Gute Fragen:
  - [q-10-03] (v5) Turbo-Taste – inhaltlich exzellente Frage, braucht nur MC-Optionen
  - [q-10-10] (v5) Anti-Shock-Discman – clever konzipiert, braucht nur MC-Optionen
  - [q-10-21-dbb37ef4e7] „Was machte der Defragmentierer?" → kurz, knackig, Nostalgie

---

## Duplikate

| A (v4)              | B (v5)  | Ähnlichkeit                                                                | Empfehlung                |
| ------------------- | ------- | -------------------------------------------------------------------------- | ------------------------- |
| q-01-10-new         | q-01-07 | Selber Prompt (Falscher Moody); v5-Variante präzisiert „in Der Feuerkelch" | v4 behalten, v5 entfernen |
| q-01-21-89c1ef5e21  | q-01-19 | Identisch: „Welche Gestalt hat der Patronus von Severus Snape?"            | v4 behalten, v5 entfernen |
| q-01-e03-a6553820f8 | q-01-23 | Identisch: HP7-Einspielergebnis                                            | v4 behalten, v5 entfernen |

Alle drei Duplikate liegen in cat-01 und entstehen durch die Überlappung von v4- und v5-Inhalten. Da beide Dateien kombiniert geladen werden, könnten theoretisch beide Versionen in einem Spiel erscheinen.

---

## Schwache Antwortoptionen

**[q-02-new-35-sugar-daddy]** Eine Option ist ein voller Satz, die anderen 1-2 Wörter. Längenunterschiede telegrafieren die richtige Antwort.

**[q-05-06-69a36d4f74]** „Leichen" hat zwei legitime Bedeutungen in der Partysprache. Die Frage steuert auf eine zu, aber Diskussion ist vorprogrammiert.

**[q-06-17-f35e9c1fce]** Antwort „Indie-Rock hören und melancholisch aufs Meer starren" ist subjektive Beschreibung, kein klar falscher Distraktor möglich → Distraktoren alle gleich schwach.

**[q-08-06]** (v5) Boyband-5. Archetyp: „Quotentänzer" ist eine Meinungs-/Humorantwort. Wenn das die einzige „richtige" Antwort ist, werden Spieler die eine andere Interpretation haben zu Recht protestieren.

**[q-06-25-290a147a5f]** Eastpak-Frage: Alle Optionen (Eastpak, Nike-Rucksack, Jansport, Samsonite-Trolley) sind als regionales Statussymbol plausibel. Mehrere richtige Antworten möglich.

---

## Faktencheck

**[q-07-e01-9ce9e570a8]** PS1 Memory Card = 1 MB → **FALSCH**. Korrekt: 128 KB = 0,125 MB (1 Megabit / 8). Hardware-Specs sind belegbar.

**[q-06-21-db7ae3022f]** Aggro Berlin als „Boygroup aus Marzahn" → ungenau in zweifacher Hinsicht: (1) Aggro Berlin war ein Rap-Label, keine Boygroup; (2) Sido stammt aus dem Märkischen Viertel (Reinickendorf), sein Bühnenimage nutzte Marzahn als Symbol für Plattenbau-Kultur, wohnte dort aber nicht primär.

**[q-06-24-bedb3b28b0]** Y2K hatte kein „Ziel" – die Frageformulierung impliziert absichtliche Schädigung. Y2K war ein Programmierungsfehler (2-stellige Jahreszahlen).

**[q-05-17-d070806f36]** „Longdrink hat nur 2 Zutaten" ist eine Vereinfachung, die technisch nicht allgemein gilt. Ein Gin Tonic mit Limette + Gurnitur hätte mehr Zutaten.

**[q-08-e01-26b596c217]** „Dragostea Din Tei 14 Wochen auf Platz 1" – Diese Zahl konnte nicht verifiziert werden. Der Song war ein Sommerhit 2004/2005, aber 14 Wochen Platz 1 erscheint hoch. Quellenangabe prüfen.

**[q-01-e01-c564fe35e2]** „142 Treppen in Hogwarts" – Bücher-Canon (HP 1, Kapitel 8). In den Filmen nicht explizit genannt. Für eine „Nur Filme"-Kategorie problematisch.

---

## Spielabend-Risiken

**[q-09-02-731a3c8f32] Müll-Tonne-Streit:** „Saubere Papierverpackungen → Papiertonne" ist bundesland-abhängig. In Bayern/Baden-Württemberg kommt das in den Gelben Sack. Mindestens 1 Person in der Gruppe wird das korrigieren. Spielfluss-Stopper.

**[q-07-e01-9ce9e570a8] PS1-Faktenfehler:** Jede Person mit auch nur oberflächlichem Hardware-Wissen weiß: 128 KB, nicht 1 MB. Der Reveal-Moment wird zu einer Diskussion über den Katalog selbst.

**[q-06-21-db7ae3022f] Aggro-Berlin-Marzahn:** Rappende Berliner oder jemand der Sieger Schlägerei 2003 miterlebt hat, wird korrigieren wollen. „Boygroup aus Marzahn" ist doppelt falsch.

**[cat-01 generell] Harry-Potter-Ablehnung:** Nicht alle Millennials mögen Harry Potter – einige aktiv nicht. Eine volle Kategorie Detailwissen aus Filmen die nicht jeder mag, kann Stimmung kippen.

**[q-04-25-logic-jungle]** Willi Herren (2021 verstorben) als Teilnehmer im Dschungelcamp zu erwähnen erzeugt unerwünschte ernste Stimmung.

**[cat-07 generell] Gaming-Nische:** Monkey Island Insult-Swordfighting, Minesweeper-Flags, Gen-1-Pokémon-Glitches – wer keine Hardcore-Gaming-Geschichte hat, sieht nur Fragezeichen. Die Gruppe wird sichtbar auseinanderfallen.

**[q-10-03 / q-10-10] OpenText auf Handys:** Spieler tippen „Sie drosselte die Geschwindigkeit" oder „Der digitale Zwischenspeicher ist leer gelaufen" auf dem Handy-Keyboard. Tippfehler-Normalisierung hilft, aber das ist kein Partyformat.

---

## Priorisierte Fixliste

### P0 – Muss behoben werden (vor dem Abend)

- [q-07-e01-9ce9e570a8] Faktenfehler PS1 Memory Card: entfernen oder `reference_value: 0.125` + `canonical: "0.125 MB (128 KB)"` setzen
- [q-10-03] (v5) Turbo-Taste: 4 MC-Optionen hinzufügen → lädt dann als MultipleChoice statt OpenText
- [q-10-10] (v5) Anti-Shock-Discman: 4 MC-Optionen hinzufügen → lädt dann als MultipleChoice statt OpenText
- [q-01-07] (v5) Duplikat entfernen
- [q-01-19] (v5) Duplikat entfernen
- [q-01-23] (v5) Duplikat entfernen

### P1 – Sollte behoben werden (verbessert Spielqualität deutlich)

- [q-09-02-731a3c8f32] Müll-Tonne-Prompt klarer formulieren oder auf eindeutige Abfälle begrenzen
- [q-06-21-db7ae3022f] Aggro-Berlin-Framing korrigieren
- [q-06-24-bedb3b28b0] Y2K-Framing von „Ziel" auf „Problem" korrigieren
- [q-05-06-69a36d4f74] „Leichen"-Ambiguität beheben
- [q-05-17-d070806f36] Longdrink-Definition präzisieren
- Alle V5-Prompts > 150 Zeichen kürzen: q-04-03, q-04-10, q-04-25, q-04-e01, q-04-e02, q-05-05, q-05-16, q-08-01, q-08-06, q-08-11, q-08-14, q-09-03, q-10-02, q-10-07
- [q-08-e02] Sandstorm-BPM zu MC umbauen
- [q-08-e03] VIVA-Einstellung zu MC umbauen
- [q-04-04-ranking-starts] Items von Plain-Strings zu `{id, label}`-Objekten umwandeln
- [q-04-19-ranking-trash] Items gleich behandeln
- [q-04-25-logic-jungle] Willi-Herren-Referenz entfernen oder Frage ersetzen

### P2 – Optional (erhöht Niveau, kein Spielblocking-Risiko)

- [q-03-11-75e907ba1d] YOLO, [q-03-18-765fd501f3] ROFL, [q-03-24-9736e71b53] OMG: durch anspruchsvollere Slang-Fragen ersetzen
- [q-04-05-9e64f181f0] Günther Jauch: zu offensichtlich
- [q-07-22-d683609ad9] Pokémon-Fahrrad: trivial
- [q-08-02-16149da58b] Bill Kaulitz: trivial
- [q-10-09-d59a3ca39c] SMS-Bedeutung: trivial
- [q-10-15-22894dcb08] USB-Definition: trivial
- [q-10-25-258ab2b479] Witz-Frage: entfernen
- [q-01-e01-c564fe35e2] Bücher-Canon in Nur-Filme-Kategorie: Frage ersetzen

---

## Abschlussbewertung

**Spielbereit: ja, mit Einschränkungen.**

V4 trägt den Abend sicher. Die besten Kategorien (cat-03 Slang, cat-05 Saufen, cat-08 Musik, cat-09 Adulting) sind clean, kurzweilig und universell partytauglich. Wer ein 10-15-Fragen-Spiel aus diesen vier Kategorien aufbaut, hat eine runde Veranstaltung.

Probleme entstehen bei: cat-01 (zu detailverliebt, spaltet Gruppe), cat-07 (zu niche für Nicht-Gamer), und den V5-Fragen mit Prompts über 150 Zeichen, die auf dem TV-Display abgeschnitten werden.

Die PS1-Faktenfehler-Frage (q-07-e01) ist die einzige Frage die aktiv spielbrechend werden kann – sie sollte vor dem Abend raus.

Wenn die P0-Liste (6 Einträge) abgearbeitet ist, ist der Katalog für den Abend fit.

---

## Review-State-Vorschlag

```json
{
  "q-07-e01-9ce9e570a8": {
    "status": "remove",
    "note": "Faktenfehler: PS1 Memory Card hat 128 KB, nicht 1 MB. Wer es weiß, eskaliert beim Reveal."
  },
  "q-10-03": {
    "status": "revise",
    "note": "Lädt als open_text (kein options-Array). 4 MC-Optionen hinzufügen damit sie als MultipleChoice lädt. Inhaltlich exzellente Turbo-Taste-Frage."
  },
  "q-10-10": {
    "status": "revise",
    "note": "Lädt als open_text. 4 MC-Optionen hinzufügen. Anti-Shock-Discman-Frage inhaltlich sehr gut."
  },
  "q-01-07": {
    "status": "remove",
    "note": "Duplikat von q-01-10-new (v4). v4-Version behalten."
  },
  "q-01-19": {
    "status": "remove",
    "note": "Duplikat von q-01-21-89c1ef5e21 (v4). Identischer Prompt: Snape-Patronus."
  },
  "q-01-23": {
    "status": "remove",
    "note": "Duplikat von q-01-e03-a6553820f8 (v4). Identischer Prompt: HP7-Einspielergebnis."
  },
  "q-10-25-258ab2b479": {
    "status": "remove",
    "note": "Kein Quiz-Inhalt: 'Umständlich sein und versagen' ist ein Witz, keine beantwortbare Frage."
  },
  "q-09-02-731a3c8f32": {
    "status": "revise",
    "note": "Antwort bundesland-abhängig (Papiertonne vs. Gelber Sack). Prompt konkretisieren oder Kategorie wechseln."
  },
  "q-05-06-69a36d4f74": {
    "status": "revise",
    "note": "Leichen = leere Flaschen ODER eingeschlafene Betrunkene – beide Bedeutungen gängig. Prompt präzisieren."
  },
  "q-05-17-d070806f36": {
    "status": "revise",
    "note": "Longdrink-Definition zu eng. '2 Zutaten' stimmt nicht allgemein. Formulierung anpassen."
  },
  "q-06-21-db7ae3022f": {
    "status": "revise",
    "note": "Aggro Berlin war kein Boyband-Projekt sondern ein Rap-Label. Sido wohnte nicht in Marzahn. Fakten korrigieren."
  },
  "q-06-24-bedb3b28b0": {
    "status": "revise",
    "note": "Y2K hatte kein 'Ziel' – es war ein Fehler, kein Angriff. Frageformulierung von 'Ziel' auf 'Problem/Ursache' ändern."
  },
  "q-04-25-logic-jungle": {
    "status": "revise",
    "note": "Willi Herren (2021 verstorben) als Negativbeispiel. Frage ersetzt oder Referenz entfernen. Prompt auch 155 Zeichen."
  },
  "q-08-e02-4ad75bc879": {
    "status": "revise",
    "note": "BPM-Wert von Sandstorm ist für niemanden schätzbar. Zu MC umbauen oder entfernen."
  },
  "q-08-e03-aac1454a8b": {
    "status": "revise",
    "note": "VIVA-Einstellung (Jahr) ist Wissen, keine Schätzung. Zu MC umbauen."
  },
  "q-06-e02-cf01d207c2": {
    "status": "revise",
    "note": "Nipplegate-Jahr ist Wissen, keine Schätzung. Zu MC umbauen."
  },
  "q-04-03-logic-kader": {
    "status": "revise",
    "note": "Prompt 181 Zeichen – wird auf TV abgeschnitten. Auf max. 120 Zeichen kürzen."
  },
  "q-04-10-logic-gerner": {
    "status": "revise",
    "note": "Prompt 178 Zeichen. Kürzen. Zusätzlich sehr GZSZ-niche."
  },
  "q-04-09-estimate-jamba": {
    "status": "revise",
    "note": "Prompt 129 Zeichen. Kürzen."
  },
  "q-04-e01": {
    "status": "revise",
    "note": "Prompt 159 Zeichen. Kürzen."
  },
  "q-04-e02": {
    "status": "revise",
    "note": "Prompt 145 Zeichen. Kürzen."
  },
  "q-05-05": {
    "status": "revise",
    "note": "Prompt 189 Zeichen + Rechenaufgabe ohne Stift auf Party. Kürzen oder vereinfachen."
  },
  "q-05-16": {
    "status": "revise",
    "note": "Prompt 180 Zeichen + komplexe Dreier-Rechnung. Kürzen."
  },
  "q-08-01": {
    "status": "revise",
    "note": "Prompt 165 Zeichen. Kürzen auf: 'Wie viele Wochen stand Schnappi auf Platz 1?'"
  },
  "q-08-06": {
    "status": "revise",
    "note": "Prompt 182 Zeichen. Kürzen. 5. Archetyp als Meinungsfrage problematisch."
  },
  "q-08-11": {
    "status": "revise",
    "note": "Prompt 205 Zeichen. Deutlich kürzen."
  },
  "q-08-14": {
    "status": "revise",
    "note": "Prompt 195 Zeichen. Kürzen. Antwort ist externe Einschätzung, keine belegbare Tatsache."
  },
  "q-09-03": {
    "status": "revise",
    "note": "Prompt 202 Zeichen. Lädt als Estimate (750 €) – inhaltlich korrekt. Nur Prompt kürzen auf max. 130 Zeichen."
  },
  "q-10-02": {
    "status": "revise",
    "note": "Prompt 166 Zeichen. Kürzen."
  },
  "q-10-07": {
    "status": "revise",
    "note": "Prompt 169 Zeichen. Kürzen."
  }
}
```
