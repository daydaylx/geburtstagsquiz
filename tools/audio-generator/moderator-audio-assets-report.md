# Moderator Audio Assets Report

Erstellt: 2026-05-19  
Quelle: `data/moderator_audio_autosplit_unverified.zip`  
Zielordner: `apps/web-display/public/audio/moderator/`  
Manifest: `apps/web-display/public/audio/moderator/manifest.json`

---

## Status

**ACHTUNG: Diese Clips sind automatisch geschnitten und sollten stichprobenartig angehört werden.**  
Die ZIP-Datei enthält `clip_order_unverified.csv` und `split_report.md` mit Details zum Auto-Split.

---

## Clips pro Kategorie

| Kategorie         | Anzahl | Dateien                   |
| ----------------- | ------ | ------------------------- |
| `next_question`   | 8      | next_question_01–08.mp3   |
| `all_wrong`       | 8      | all_wrong_01–08.mp3       |
| `filler`          | 8      | filler_01–08.mp3          |
| `all_correct`     | 7      | all_correct_01–07.mp3     |
| `leader_change`   | 7      | leader_change_01–07.mp3   |
| `winner`          | 7      | winner_01–07.mp3          |
| `close_race`      | 6      | close_race_01–06.mp3      |
| `comeback`        | 6      | comeback_01–06.mp3        |
| `final_questions` | 6      | final_questions_01–06.mp3 |
| `reveal_intro`    | 6      | reveal_intro_01–06.mp3    |
| `scoreboard`      | 6      | scoreboard_01–06.mp3      |
| `single_correct`  | 6      | single_correct_01–06.mp3  |
| `time_low`        | 6      | time_low_01–06.mp3        |
| `intro`           | 5      | intro_01–05.mp3           |
| `last_question`   | 5      | last_question_01–05.mp3   |
| **Gesamt**        | **97** |                           |

---

## Fehlende Kategorien

Keine. Alle 15 geplanten Kategorien sind vorhanden.

---

## Validierung

- MP3-Dateien: 97
- Leere Dateien (0 Bytes): 0
- Manifest-Pfade korrekt (`/audio/moderator/name.mp3`): ja (aus ZIP übernommen)
- Unsichere Dateinamen: keine

---

## Empfohlene Stichproben zum manuellen Anhören

Mindestens diese Clips vor dem Quiz-Abend anhören:

```
intro_01.mp3          – erster Eindruck, Intro-Qualität
winner_01.mp3         – wichtigster Clip am Ende
all_wrong_01.mp3      – häufig gespielt, Ton prüfen
leader_change_01.mp3  – wichtiges Event, Verständlichkeit
final_questions_01.mp3 – Endspurt-Feeling
last_question_01.mp3  – einmaliger Moment
next_question_01.mp3  – wird am häufigsten gespielt
filler_01.mp3         – Qualität der Füller
```

---

## Integration

Die Clips werden von `apps/web-display/src/lib/moderatorAudio.ts` geladen und nur auf Display/TV abgespielt.  
Host-Einstellungen (an/aus, Häufigkeit) werden via `ROOM_SETTINGS_UPDATE` synchronisiert.  
Fehlende oder defekte Dateien werden ignoriert – das Quiz läuft unverändert wenn der Moderator deaktiviert ist.
