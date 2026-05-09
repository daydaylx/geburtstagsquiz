# archive/

Backups der ursprünglichen Fragenkatalog-Dateien vor der Migration zu einzelnen Kategorie-Dateien.

- `geburtstagsquiz_millennials_engine_v4_release_candidate.json` — 177 Fragen, alte Monolith-Struktur
- `geburtstagsquiz_millennials_engine_v5_expanded.json` — 209 Fragen, alte Monolith-Struktur

Die aktuelle Quelle ist `data/quiz/questions/cat-*.json` (386 deduplizierte Fragen in 10 Kategorien).
`scripts/migrate-to-categories.mjs` hat diese Dateien als Eingabe verwendet.
