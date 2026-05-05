#!/usr/bin/env node
// Wendet alle Audit-Fixes auf beide Fragenkatalog-JSONs an.
// Aufruf: node scripts/fix-questions.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function load(file) {
  return JSON.parse(readFileSync(resolve(ROOT, file), "utf8"));
}

function save(file, data) {
  writeFileSync(resolve(ROOT, file), JSON.stringify(data, null, 2) + "\n", "utf8");
}

function findQuestion(categories, id) {
  for (const cat of categories) {
    const q = cat.questions.find((q) => q.id === id);
    if (q) return { q, cat };
  }
  return null;
}

function removeQuestion(categories, id) {
  for (const cat of categories) {
    const idx = cat.questions.findIndex((q) => q.id === id);
    if (idx >= 0) {
      cat.questions.splice(idx, 1);
      return true;
    }
  }
  return false;
}

// ── v4 fixes ──────────────────────────────────────────────────────────────────

const v4 = load("geburtstagsquiz_millennials_engine_v4_release_candidate.json");
const cats4 = v4.quiz.categories;

// P0: PS1 Memory Card – Faktenfehler
{
  const { q } = findQuestion(cats4, "q-07-e01-9ce9e570a8");
  q.answer.reference_value = 0.125;
  q.answer.canonical = "0,125 MB (128 KB)";
  q.answer.context =
    "Die PS1 Memory Card hatte 1 Megabit = 128 Kilobyte = 0,125 MB Speicher, aufgeteilt auf 15 Speicherblöcke.";
  q.explanation =
    "Die PS1 Memory Card speicherte 128 KB – das sind 0,125 MB, nicht 1 MB. Ein häufiger Irrtum, weil 'Megabit' leicht mit 'Megabyte' verwechselt wird.";
  console.log("✓ v4 q-07-e01: PS1-Faktenfehler korrigiert (1 MB → 0,125 MB)");
}

// P2: Witzfrage entfernen
removeQuestion(cats4, "q-10-25-258ab2b479");
console.log("✓ v4 q-10-25: Witzfrage entfernt");

// P1: Müll-Tonne – bundesland-neutral umformulieren
{
  const { q } = findQuestion(cats4, "q-09-02-731a3c8f32");
  q.prompt = "In welche Tonne gehört ein alter, trockener Zeitungsstapel?";
  q.explanation =
    "Zeitungen und unbedrucktes Papier gehören immer in die Papiertonne – das gilt bundesweit. Bei beschichteten Papierverpackungen kann je nach Gemeinde auch der Gelbe Sack zuständig sein.";
  console.log("✓ v4 q-09-02: Müll-Frage auf Zeitungen (eindeutig) umgestellt");
}

// P1: Leichen – Ambiguität beheben
{
  const { q } = findQuestion(cats4, "q-05-06-69a36d4f74");
  q.prompt =
    "Was bezeichnet man in der Partysprache als 'Leichen' – also schlafende Personen die nach der Feier überall liegen?";
  const correctOpt = q.options.find((o) => o.is_correct);
  correctOpt.text = "Betrunkene Gäste, die irgendwo eingeschlafen sind";
  const wrongFlasche = q.options.find((o) => o.text.toLowerCase().includes("flasche"));
  if (wrongFlasche) wrongFlasche.text = "Leere Dosen und Flaschen, die überall stehen";
  q.explanation =
    "Im Partyslang sind 'Leichen' die eingeschlafenen Gäste. Leere Flaschen heißen Leichen nur umgangssprachlich in manchen Regionen – die Hauptbedeutung sind die schlafenden Personen.";
  console.log("✓ v4 q-05-06: Leichen-Ambiguität behoben");
}

// P1: Longdrink-Definition präzisieren
{
  const { q } = findQuestion(cats4, "q-05-17-d070806f36");
  const correctOpt = q.options.find((o) => o.is_correct);
  correctOpt.text =
    "Longdrinks bestehen typischerweise aus einer Spirituose, die mit einem alkoholfreien Getränk aufgefüllt wird";
  q.explanation =
    "Ein Longdrink ist eine Spirituose + Filler (Wasser, Soda, Saft, Cola…). Die '2 Zutaten'-Formel ist eine Vereinfachung – Garnitur nicht mitgezählt.";
  console.log("✓ v4 q-05-17: Longdrink-Definition präzisiert");
}

// P1: Aggro Berlin / Marzahn – korrigieren
{
  const { q } = findQuestion(cats4, "q-06-21-db7ae3022f");
  q.prompt =
    "Welches Berliner Rap-Kollektiv sorgte 2003 mit Masken und provokanten Texten für einen Skandal im deutschen Musikgeschäft?";
  q.explanation =
    "Aggro Berlin war ein Rap-Label (kein Boyband-Projekt), das u. a. Sido, B-Tight und Fler unter Vertrag hatte. Das Label-Image wurde stark mit dem Berliner Plattenbau-Milieu assoziiert.";
  console.log("✓ v4 q-06-21: Aggro-Berlin-Framing korrigiert");
}

// P1: Y2K „Ziel" → „Problem"
{
  const { q } = findQuestion(cats4, "q-06-24-bedb3b28b0");
  q.prompt = "Was war das Kernproblem des „Millennium-Bugs“ (Y2K), vor dem alle 1999 Panik hatten?";
  const correctOpt = q.options.find((o) => o.is_correct);
  correctOpt.text =
    "Computer-Software speicherte Jahreszahlen nur zweistellig – das Jahr 2000 hätte als '00' gelesen werden und Abstürze verursachen können";
  q.explanation =
    "Y2K war kein Angriff, sondern ein Programmierungsfehler: Jahreszahlen wurden in vielen Systemen nur als zweistellige Zahl gespeichert. '00' wäre als 1900 interpretiert worden.";
  console.log("✓ v4 q-06-24: Y2K-Framing von 'Ziel' auf 'Problem' korrigiert");
}

// P1: BPM Sandstorm – Estimate → MC
{
  const { q } = findQuestion(cats4, "q-08-e02-4ad75bc879");
  q.type = "multiple_choice";
  q.options = [
    { id: "q-08-e02-opt-1", text: "112 BPM", is_correct: false },
    { id: "q-08-e02-opt-2", text: "128 BPM", is_correct: false },
    { id: "q-08-e02-opt-3", text: "136 BPM", is_correct: true },
    { id: "q-08-e02-opt-4", text: "150 BPM", is_correct: false },
  ];
  q.correct_option_id = "q-08-e02-opt-3";
  q.explanation =
    "Sandstorm von Darude läuft bei 136 BPM – klassisches Trance-Tempo. Wer das wusste, ohne es nachzuschlagen: Respekt.";
  delete q.answer;
  console.log("✓ v4 q-08-e02: BPM-Sandstorm von Estimate zu MC konvertiert");
}

// P1: VIVA-Jahr – Estimate → MC
{
  const { q } = findQuestion(cats4, "q-08-e03-aac1454a8b");
  q.type = "multiple_choice";
  q.options = [
    { id: "q-08-e03-opt-1", text: "2012", is_correct: false },
    { id: "q-08-e03-opt-2", text: "2015", is_correct: false },
    { id: "q-08-e03-opt-3", text: "2018", is_correct: true },
    { id: "q-08-e03-opt-4", text: "2021", is_correct: false },
  ];
  q.correct_option_id = "q-08-e03-opt-3";
  q.explanation =
    "VIVA wurde am 31. Dezember 2018 eingestellt. Der Sender lief seit 1993 – fast 25 Jahre Musikgeschichte.";
  delete q.answer;
  console.log("✓ v4 q-08-e03: VIVA-Jahr von Estimate zu MC konvertiert");
}

// P1: Nipplegate-Jahr – Estimate → MC
{
  const { q } = findQuestion(cats4, "q-06-e02-cf01d207c2");
  q.type = "multiple_choice";
  q.options = [
    { id: "q-06-e02-opt-1", text: "2001", is_correct: false },
    { id: "q-06-e02-opt-2", text: "2003", is_correct: false },
    { id: "q-06-e02-opt-3", text: "2004", is_correct: true },
    { id: "q-06-e02-opt-4", text: "2007", is_correct: false },
  ];
  q.correct_option_id = "q-06-e02-opt-3";
  q.explanation =
    "Der 'Nipplegate'-Vorfall ereignete sich am 1. Februar 2004 während der Halbzeit-Show des Super Bowl XXXVIII. Er löste eine der größten Zensur-Debatten in der US-Mediengeschichte aus.";
  delete q.answer;
  console.log("✓ v4 q-06-e02: Nipplegate-Jahr von Estimate zu MC konvertiert");
}

save("geburtstagsquiz_millennials_engine_v4_release_candidate.json", v4);
console.log("\n✓ v4 gespeichert\n");

// ── v5 fixes ──────────────────────────────────────────────────────────────────

const v5 = load("geburtstagsquiz_millennials_engine_v5_expanded.json");
const cats5 = v5.quiz.categories;

// P0: Duplikate entfernen
for (const id of ["q-01-07", "q-01-19", "q-01-23"]) {
  removeQuestion(cats5, id);
  console.log(`✓ v5 ${id}: Duplikat entfernt`);
}

// P0: q-10-03 Turbo-Taste – Optionen hinzufügen (OpenText → MC)
{
  const { q } = findQuestion(cats5, "q-10-03");
  q.options = [
    {
      id: "q-10-03-opt-1",
      text: "Sie beschleunigte den PC auf maximale Leistung",
      is_correct: false,
    },
    {
      id: "q-10-03-opt-2",
      text: "Sie drosselte die CPU-Taktrate für ältere Software",
      is_correct: true,
    },
    {
      id: "q-10-03-opt-3",
      text: "Sie aktivierte einen Extra-Turbo-Speicher",
      is_correct: false,
    },
    {
      id: "q-10-03-opt-4",
      text: "Sie schaltete den zweiten Prozessorkern zu",
      is_correct: false,
    },
  ];
  q.correct_option_id = "q-10-03-opt-2";
  q.explanation =
    "Die Turbo-Taste drosselte die CPU – das Gegenteil von dem was ihr Name suggeriert. Sie war für Kompatibilität mit alten Programmen gedacht, die mit Vollgas-CPU nicht liefen.";
  console.log("✓ v5 q-10-03: Turbo-Taste – Optionen hinzugefügt (OpenText → MC)");
}

// P0: q-10-10 Anti-Shock-Discman – Optionen hinzufügen (OpenText → MC)
{
  const { q } = findQuestion(cats5, "q-10-10");
  q.options = [
    {
      id: "q-10-10-opt-1",
      text: "Der CD-Laser überhitzt beim Joggen",
      is_correct: false,
    },
    {
      id: "q-10-10-opt-2",
      text: "Der digitale Puffer ist nach 31 Sekunden leer gelaufen",
      is_correct: true,
    },
    {
      id: "q-10-10-opt-3",
      text: "Der Motor verliert beim Schwingen an Drehzahl",
      is_correct: false,
    },
    {
      id: "q-10-10-opt-4",
      text: "Die Batterien schwächeln unter Belastung",
      is_correct: false,
    },
  ];
  q.correct_option_id = "q-10-10-opt-2";
  q.explanation =
    "Der '30-Sekunden Anti-Shock' puffert 30 Sekunden CD-Daten im Speicher. Nach genau 31 Sekunden Vibration ist dieser Vorrat aufgebraucht – und es springt.";
  console.log("✓ v5 q-10-10: Anti-Shock-Discman – Optionen hinzugefügt (OpenText → MC)");
}

// P1: Rankings – Items von Strings zu Objekten
{
  const { q: q1 } = findQuestion(cats5, "q-04-04-ranking-starts");
  q1.items = [
    { id: "A", label: "Big Brother (RTL II)" },
    { id: "B", label: "Deutschland sucht den Superstar (RTL)" },
    { id: "C", label: "Ich bin ein Star – Holt mich hier raus! (RTL)" },
    { id: "D", label: "Germany's Next Topmodel (ProSieben)" },
  ];
  q1.correct_order = ["A", "B", "C", "D"];
  q1.explanation =
    "Start-Reihenfolge: Big Brother (2000), DSDS (2002), Dschungelcamp (2004), GNTM (2006). Kultureller Verfall in Echtzeit.";
  console.log("✓ v5 q-04-04-ranking-starts: Items von Strings zu Objekten");
}
{
  const { q: q2 } = findQuestion(cats5, "q-04-19-ranking-trash");
  q2.items = [
    { id: "A", label: "Zlatko Trpkovski (Big Brother)" },
    { id: "B", label: "Kader Loth (Die Alm)" },
    { id: "C", label: "Daniela Katzenberger (Auf und davon)" },
    { id: "D", label: "Melanie Müller (Der Bachelor)" },
  ];
  q2.correct_order = ["A", "B", "C", "D"];
  q2.explanation =
    "Zlatko (2000), Kader Loth (2004 Die Alm), Katzenberger (2007), Melanie Müller (2013). Trash-Evolution über 13 Jahre.";
  console.log("✓ v5 q-04-19-ranking-trash: Items von Strings zu Objekten");
}

// P1: Lange Prompts kürzen (>150 Zeichen)
const promptFixes = [
  {
    id: "q-04-03-logic-kader",
    prompt: "Welches Trash-Format hat Kader Loth als einziges als Siegerin verlassen?",
  },
  {
    id: "q-04-10-logic-gerner",
    prompt:
      "Wer hält in GZSZ den inoffiziellen Rekord für die meisten Hochzeiten in der Seriengeschichte?",
  },
  {
    id: "q-05-05",
    prompt:
      "Vorglüh-Check: 0,7l Wodka (37,5%) + 20 Flaschen Bier (0,5l, 5%). Wie viel Liter reiner Alkohol sind das?",
  },
  {
    id: "q-05-16",
    prompt:
      "Freund A bringt 6 Bier, B bringt 4, C bringt 0 und zahlt 10 €. Wer bekommt wie viel von den 10 €?",
  },
  {
    id: "q-08-01",
    prompt:
      "Wie viele Wochen stand 'Schnappi, das kleine Krokodil' 2005 auf Platz 1 der deutschen Charts?",
  },
  {
    id: "q-08-06",
    prompt:
      "Boyband-Archetypen: Süßer, Bad Boy, Schüchterner, Älterer (Bruder-Typ). Was ist das fünfte klassische Mitglied?",
  },
  {
    id: "q-08-11",
    prompt:
      "Was passierte laut 'Sk8er Boi' von Avril Lavigne mit dem Jungen, nachdem das Mädchen ihn abgewiesen hatte?",
  },
  {
    id: "q-08-14",
    prompt:
      "Backstreet Boys 'I Want It That Way': Warum ergibt die Antwort 'Ain't nothin' but a heartache' auf 'Tell me why' textlich keinen Sinn?",
  },
  {
    id: "q-09-03",
    prompt:
      "Mietmathe: Kaltmiete 600 €, Nebenkosten 150 €, Strom 80 € direkt an Versorger. Was überweist du an den Vermieter?",
  },
  {
    id: "q-10-02",
    prompt:
      "Wie viele Stunden hielt der Akku des Nokia 3310 laut Hersteller im Standby-Modus durch?",
  },
  {
    id: "q-10-07",
    prompt:
      "Wie viele Kilogramm wog ein typischer 19-Zoll-Röhrenmonitor (CRT) aus dem Jahr 2002 ungefähr?",
  },
];

for (const { id, prompt } of promptFixes) {
  const hit = findQuestion(cats5, id);
  if (!hit) {
    console.log(`⚠ v5 ${id}: nicht gefunden, übersprungen`);
    continue;
  }
  const oldLen = hit.q.prompt?.length ?? 0;
  hit.q.prompt = prompt;
  console.log(`✓ v5 ${id}: Prompt ${oldLen}c → ${prompt.length}c`);
}

// P1: q-04-25 – Willi Herren entfernen + Prompt kürzen
{
  const hit = findQuestion(cats5, "q-04-25-logic-jungle");
  if (hit) {
    const { q } = hit;
    q.prompt =
      "Welche dieser Personen hat es bis 2023 tatsächlich geschafft, NICHT als Kandidat im RTL-Dschungelcamp zu landen?";
    const williOpt = q.options.find((o) => o.text.toLowerCase().includes("willi"));
    if (williOpt) {
      williOpt.text = "Stefan Raab";
      williOpt.is_correct = false;
    }
    q.explanation =
      "Christian Ulmen verweigerte konsequent alle Einladungen zu Trash-Reality-Formaten. Stefan Raab ebenfalls – aber Ulmen ist hier die Antwort. Die anderen drei waren alle dabei.";
    console.log(`✓ v5 q-04-25: Willi-Herren-Referenz durch Stefan Raab ersetzt, Prompt gekürzt`);
  }
}

save("geburtstagsquiz_millennials_engine_v5_expanded.json", v5);
console.log("\n✓ v5 gespeichert\n");

// ── Verifikation ──────────────────────────────────────────────────────────────
console.log("── Verifizierung ──");
const v4check = load("geburtstagsquiz_millennials_engine_v4_release_candidate.json");
const v5check = load("geburtstagsquiz_millennials_engine_v5_expanded.json");
const all = [
  ...v4check.quiz.categories.flatMap((c) => c.questions),
  ...v5check.quiz.categories.flatMap((c) => c.questions),
];

const long = all.filter((q) => (q.prompt?.length ?? 0) > 150);
console.log(`Prompts > 150 Zeichen: ${long.length}`);
if (long.length) for (const q of long) console.log(`  ${q.id} (${q.prompt?.length}c)`);

const removed = ["q-01-07", "q-01-19", "q-01-23", "q-10-25-258ab2b479"];
for (const id of removed) {
  const found = all.find((q) => q.id === id);
  console.log(`Entfernt ${id}: ${found ? "FEHLER – noch vorhanden!" : "ok"}`);
}

const ps1 = all.find((q) => q.id === "q-07-e01-9ce9e570a8");
console.log(`PS1 reference_value: ${ps1?.answer?.reference_value} (erwartet: 0.125)`);
