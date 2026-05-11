#!/usr/bin/env node
// Einmaliges Migrationsskript (bereits ausgeführt – nicht nochmals starten).
// Liest v4/v5-Quelldateien und schreibt 10 Kategorie-Dateien nach data/quiz/questions/.
// Die Quelldateien liegen jetzt in archive/, nicht im Repo-Root.
// Zum erneuten Ausführen: SOURCE_FILES auf archive/<dateiname> anpassen.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = resolve(ROOT, "data/quiz/questions");

const SOURCE_FILES = [
  "geburtstagsquiz_millennials_engine_v4_release_candidate.json",
  "geburtstagsquiz_millennials_engine_v5_expanded.json",
];

const CATEGORY_SLUGS = {
  "cat-01": "harry-potter",
  "cat-02": "sex-liebe",
  "cat-03": "internet-slang",
  "cat-04": "trash-tv",
  "cat-05": "party-drinks",
  "cat-06": "popkultur",
  "cat-07": "gaming",
  "cat-08": "musik",
  "cat-09": "adulting",
  "cat-10": "technik",
};

mkdirSync(OUT_DIR, { recursive: true });

// Sammle alle Kategorien und deren Fragen über beide Dateien
const categoryMap = new Map(); // category_id -> { meta, questions: Map<id, question> }
let totalFromSources = 0;
let totalDuplicates = 0;

for (const fname of SOURCE_FILES) {
  const raw = JSON.parse(readFileSync(resolve(ROOT, fname), "utf8"));
  const categories = raw.quiz?.categories ?? [];

  for (const cat of categories) {
    const catId = cat.category_id ?? cat.id ?? cat.slug;
    if (!catId) {
      console.warn(`[warn] Kategorie ohne ID in ${fname} – übersprungen`);
      continue;
    }

    if (!categoryMap.has(catId)) {
      categoryMap.set(catId, {
        category_id: catId,
        slug: cat.slug ?? CATEGORY_SLUGS[catId] ?? catId,
        name: cat.name ?? catId,
        ...(cat.difficulty ? { difficulty: cat.difficulty } : {}),
        tags: cat.tags ?? [],
        questions: new Map(),
      });
    }

    const entry = categoryMap.get(catId);

    // Metadaten aus erster Datei bevorzugen, aber fehlende ergänzen
    if (!entry.difficulty && cat.difficulty) entry.difficulty = cat.difficulty;
    if (entry.tags.length === 0 && cat.tags?.length) entry.tags = cat.tags;

    for (const q of cat.questions ?? []) {
      totalFromSources++;
      if (entry.questions.has(q.id)) {
        totalDuplicates++;
        continue;
      }
      entry.questions.set(q.id, q);
    }
  }
}

// Schreibe Kategorie-Dateien
let totalWritten = 0;
const report = [];

const sortedCategories = [...categoryMap.entries()].sort(([a], [b]) => a.localeCompare(b));

for (const [catId, entry] of sortedCategories) {
  const slug = CATEGORY_SLUGS[catId] ?? entry.slug ?? catId;
  const outFile = resolve(OUT_DIR, `${catId}-${slug}.json`);
  const questions = [...entry.questions.values()];

  const output = {
    category_id: entry.category_id,
    slug: entry.slug,
    name: entry.name,
    ...(entry.difficulty ? { difficulty: entry.difficulty } : {}),
    tags: entry.tags,
    question_count: questions.length,
    questions,
  };

  writeFileSync(outFile, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  totalWritten += questions.length;
  report.push({
    catId,
    name: entry.name,
    count: questions.length,
    file: `data/quiz/questions/${catId}-${slug}.json`,
  });
}

// Import-Bericht
console.log("\n=== Migrations-Bericht ===\n");
console.log(`Quelldateien:          ${SOURCE_FILES.length}`);
console.log(`Fragen in Quellen:     ${totalFromSources}`);
console.log(`Duplikate ignoriert:   ${totalDuplicates}`);
console.log(`Eindeutige Fragen:     ${totalWritten}`);
console.log(`Kategorien:            ${report.length}`);
console.log("");
console.log("Fragen pro Kategorie:");
for (const { catId, name, count, file } of report) {
  console.log(`  [${catId}] ${name}: ${count} Fragen  →  ${file}`);
}
console.log("");

if (totalWritten !== 386) {
  console.error(`[FEHLER] Erwartet 386 eindeutige Fragen, gefunden: ${totalWritten}`);
  process.exit(1);
}

console.log(`[OK] Migration abgeschlossen: ${totalWritten} Fragen in ${report.length} Kategorie-Dateien.`);
