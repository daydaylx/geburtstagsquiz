#!/usr/bin/env node
// Zweite Runde: verbleibende Prompts > 150 Zeichen kürzen (alle in v5).
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "geburtstagsquiz_millennials_engine_v5_expanded.json";

const v5 = JSON.parse(readFileSync(resolve(ROOT, FILE), "utf8"));
const allQ = v5.quiz.categories.flatMap((c) => c.questions);

function patch(id, newPrompt) {
  const q = allQ.find((q) => q.id === id);
  if (!q) {
    console.log(`⚠ ${id}: nicht gefunden`);
    return;
  }
  const old = q.prompt.length;
  q.prompt = newPrompt;
  console.log(`✓ ${id}: ${old}c → ${newPrompt.length}c`);
}

patch(
  "q-04-05-mistake-alm",
  "Welche ProSieben-Show ließ Promis auf einer Alm Kuhfladen wiegen – BEVOR das Dschungelcamp das Genre in Deutschland populär machte?",
);

patch(
  "q-04-07-pattern-catchphrase",
  "Wie endet die Reihe: 'Next!' (Next), 'Kein Foto für dich' (GNTM), 'Du bist raus!' (Big Brother), ...?",
);

patch(
  "q-04-e01-b137796e03",
  "Wie viele Tage verbrachte Zlatko in der allerersten Big-Brother-Staffel im Haus?",
);

patch(
  "q-06-02",
  "Wer trug nach 'Nipplegate' 2004 die meisten Konsequenzen – obwohl beide Beteiligten gleich verantwortlich waren?",
);

patch(
  "q-06-03",
  "Kanye unterbricht 2009 Taylor Swifts Dankesrede. Für welchen Award hatte Swift gewonnen, den Kanye für Beyoncé beanspruchte?",
);

patch(
  "q-07-02",
  "Minesweeper: Ein Feld zeigt '3' und hat nur noch genau 3 ungeöffnete Nachbarn. Wie viele Minen sind darunter?",
);

patch(
  "q-07-09",
  "Welche Konsole grüßt mit: tiefem Dröhnen, glitzerndem Twinkle-Sound – und hängt dann gerne im schwarzen Bildschirm?",
);

patch(
  "q-08-03",
  "MCR 'Welcome to the Black Parade': Was folgt nach dem einleitenden Solo-Klavier-'G', das 90% der Ex-Emos sofort erkennen?",
);

patch(
  "q-08-07",
  "Wie viele Millionen Exemplare verkaufte *NSYNC 'No Strings Attached' allein in der ersten Verkaufswoche (US-Rekord 2000)?",
);

patch(
  "q-08-15",
  "Was kostete ein Jamba-Sparabo (3 Klingeltöne pro Monat) im Jahr 2004 typischerweise pro Monat?",
);

patch(
  "q-10-05",
  "Was passiert technisch wirklich, wenn man einen USB-Stick unter Windows einfach abzieht – ohne 'Sicher entfernen'?",
);

patch(
  "q-10-11",
  "Auf kleiner (Nokia 8210) → flacher (Razr) → polyphone Klingeltöne folgte ab 2007 welcher radikale Trend?",
);

writeFileSync(resolve(ROOT, FILE), JSON.stringify(v5, null, 2) + "\n", "utf8");
console.log("\n✓ v5 gespeichert");

// Verifikation
const remaining = v5.quiz.categories
  .flatMap((c) => c.questions)
  .filter((q) => (q.prompt?.length ?? 0) > 150);
console.log(`\nVerbleibende Prompts > 150c: ${remaining.length}`);
for (const q of remaining)
  console.log(`  ${q.id} (${q.prompt.length}c): ${q.prompt.slice(0, 60)}…`);
