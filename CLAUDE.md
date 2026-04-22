# CLAUDE.md

# Projekt-Kontext für Claude Code Agenten

## Projektübersicht

**Quiz Dual Screen** – browserbasiertes Multiplayer-Quizspiel.

- Host auf Laptop/TV (Hauptscreen)
- Player auf Smartphones
- zentraler Server als Spielwahrheit
- WebSocket-Echtzeitkommunikation
- MVP-fokussiert, kein Feature-Overload

---

## Sofort-Regeln für diesen Agent

### 1. Scope ist heilig

Wenn die Task nicht explizit ein Feature nennt, baust du es nicht.

**Beispiele:**

❌ **Falsch:**

```
Task: "Implementiere Multiple-Choice"
Agent: Baut auch Schätzfrage, Buzzer, Quiz-Editor, Cloud-Sync, Accounts...
```

✅ **Richtig:**

```
Task: "Implementiere Multiple-Choice"
Agent: Baut NUR Multiple-Choice, sauber, stabil. Alles andere wird bewusst ausgelassen.
```

### 2. Keine großen Refactors aus Prinzip

Refactor ist nur ok, wenn:

- die aktuelle Struktur ist nachweislich kaputt
- Refactor macht folgende Aufgabe einfacher, nicht „in Zukunft nützlich"
- der Refactor ist klein und fokussiert

Nicht ok:

- „ich ziehe das mal eben um, weil es besser wäre"
- „ich mach schnell eine neue Abstraktion für mögliche Zukunft"
- „lass mich das ganze Ding neu strukturieren"

### 3. Vor jeder Dateiänderung: stoppen und denken

Bevor mehr als 2–3 Dateien gleichzeitig angepasst werden:

- Ist das wirklich nötig?
- Kann ich die Aufgabe in Teile zerlegen?
- Erste Datei anpassen, prüfen, erst dann nächste?

Claude Code neigt dazu, große Diffs zu machen. Nicht hier.

### 4. Nach Code-Änderungen: immer selbst prüfen

Checkliste nach eigener Umsetzung:

- [ ] Ist Logik doppelt?
- [ ] Ist etwas unnötig kompliziert?
- [ ] Server authoritative?
- [ ] Eventnamen konsistent?
- [ ] Neue Dateien wirklich nötig?
- [ ] Dokumentation aktualisiert?
- [ ] Scope ist gleich geblieben oder kleiner?

Wenn ja zu einer der negativen Fragen: selbst korrigieren oder begründen, warum.

---

## Dateien lesen VOR Änderungen

Lese relevant Dateien, bevor du änderst:

- `AGENTS.md` – Richtlinien
- `WORKFLOW.md` – Arbeitsablauf
- `docs/architecture.md` – wie es gebaut wird (kanonisch)
- `docs/IMPLEMENTATION.md` – Phase und Ziele
- `docs/CONSTRAINTS.md` – Fallstricke

Diese Dateien sind nicht „gelesen ein Mal zu Anfang", sondern **vor jeder größeren Änderung kurz überprüft**.

---

## Typische Fehler die du vermeiden sollst

### Fehler 1: "Lass mich die Struktur optimieren"

Symptom: Agent erstellt neue Dateien, reorganisiert alles, macht große Umbauten.

**Prävention:** Lese vor Struktur-Änderungen `WORKFLOW.md` → Punkt „Regeln für neue Dateien". Wenn keine neuen Dateien nötig sind: nicht anlegen.

### Fehler 2: "Lass mich vorsorglich diese Abstraktion bauen"

Symptom: Agent baut Systeme „weil sie später nützlich sein könnten".

**Prävention:** Nur bauen, was für die **aktuelle Phase** nötig ist. Alles andere ist Über-Engineering.

### Fehler 3: "Der Code funktioniert, also ist er gut"

Symptom: Agent kümmert sich nicht um Wartbarkeit, Duplikate, unnötige Komplexität.

**Prävention:** Nach jeder Umsetzung die Selbst-Prüf-Checkliste abarbeiten.

### Fehler 4: "Lass mich schnell noch dieses andere Feature auch bauen"

Symptom: Agent weitet Scope unbewusst aus.

**Prävention:** Wenn Task nicht explizit sagt „auch X machen": nicht machen. Wenn nötig: eigene Task für X vorschlagen, nicht mitziehen.

### Fehler 5: "Tests sind nicht nötig, Code ist einfach"

Symptom: Agent testet nicht, was er baut.

**Prävention:** Für Spiellogik: immer testen. Für UI: auf echten Geräten testen (oder begründen, warum nicht).

---

## Was du bei Tasks tun sollst

### Wenn Task unklar ist

Nicht einfach eine Annahme treffen und machen. Stattdessen:

1. Task zusammenfassen
2. Scope definieren (was ist rein, was nicht)
3. kurz nachfragen oder Annahmen nennen
4. Erst dann implementieren

### Wenn Task zu groß ist

Nicht versuchen, alles auf einmal zu machen. Stattdessen:

1. Task in Teile zerlegen
2. ersten Teil klar definieren
3. die anderen Teile als separate Aufgaben nennen
4. mit kleinstem sinnvollen Schritt starten

### Wenn du Risiken siehst

Nicht verschweigen. Stattdessen:

1. Risiko klar benennen
2. Auswirkung beschreiben
3. workaround oder Priorisierung vorschlagen
4. vor Umsetzung klären

---

## Dokumentation updaten

Wenn du Code-Struktur änderst, prüfe:

- [ ] `docs/architecture.md` noch aktuell?
- [ ] `docs/IMPLEMENTATION.md` noch korrekt?
- [ ] `AGENTS.md` noch passend?
- [ ] `README.md` noch wahr?

Kleine Änderungen erlaubt. Große Architektur-Umbauten müssen dokumentiert werden **während** du sie machst, nicht danach.

---

## Kommunikation mit dem Nutzer

Sag nicht:

- "ich mache mal schnell..."
- "kurze Änderung..."
- "ist einfach..."

Sag stattdessen:

- "Ich ändere X Dateien: [Liste]"
- "Das riskaunt: [Risiko]"
- "Das kann ich jetzt nicht, weil: [Grund]"
- "Das würde bedeuten: [konkrete Auswirkung]"

Der Nutzer soll immer wissen, was passiert, nicht überrascht werden.

---

## Task-Größe und Realismus

Ehrlich kalkulieren:

- Phase 0 (Struktur): 1–2 Tage
- Phase 1 (Lobby): 2–3 Tage
- Phase 2 (Events): 1–2 Tage
- Phase 3 (Multiple Choice): 2–3 Tage
- Phase 4 (Scoring): 1 Tag
- Phase 5 (Härten): 2–3 Tage

**Nicht:** "Das mache ich schnell heute".

Wenn etwas länger dauert als erwartet: das offen sagen, nicht verstecken.

---

## Testing

### Mindestens

- Shared-Types: TypeScript-Compilation
- Shared-Protocol: Schema-Validierung testen
- Server: kritische Logik Unit-Tests
- UI: auf echtem mobilen Gerät testen (oder Video-Walkthrough)

### Nicht nötig im MVP

- Full E2E-Automation
- 20 Browser-Compatibility
- Load-Tests mit 1000 Spielern

---

## Code-Review-Mentalität

Der Agent (du) sollst auch:

- Eigenen Code kritisch lesen
- Duplikate suchen
- Unnötige Komplexität finden
- Sicherheitsprobleme checken
- Performance-Fallen sehen

Nicht nur:

- "Code läuft" = fertig

Sondern:

- "Code läuft, ist sauber, ist wartbar, hat keine Fallstricke" = fertig

---

## Wenn du nicht weißt, wie man etwas macht

Nicht:

- „Ich probier es einfach"
- „Das wird schon"
- „Ich mach eine Placeholder-Implementierung"

Sondern:

- Klar benennen: „Das Feature braucht X und ich habe keine stabile Lösung"
- Optionen vorschlagen
- mit Nutzer klären
- **dann** implementieren

---

## Zusammenfassung der Regeln

1. **Scope ist heilig** – nur das bauen, das gevordert ist
2. **Keine großen Refactors aus Prinzip** – nur wenn nötig
3. **Selbst prüfen** – nach Umsetzung kritisch Review
4. **Doku aktualisieren** – Code und Doku synchron
5. **Klar kommunizieren** – keine Überraschungen
6. **Ehrlich einschätzen** – nicht beschönigen
7. **Testing ernst nehmen** – nicht weglassen
8. **Risiken nennen** – nicht schweigen

---

## Links zu Details

- `AGENTS.md` – Detaillierte Richtlinien für jeden Aspekt
- `WORKFLOW.md` – Arbeitsablauf Phase für Phase
- `docs/architecture.md` – technisches Design (kanonisch)
- `docs/IMPLEMENTATION.md` – konkreter Phasenplan mit Abnahmekriterien
- `docs/CONSTRAINTS.md` – Fallstricke und bewusstes Weglassen

**Kanonische Quellen:** Phasenplan → `docs/IMPLEMENTATION.md` | Architektur → `docs/architecture.md` | Zustandsmaschine → `docs/state-machine.md` | Event-Protokoll → `docs/event-protocol.md`
