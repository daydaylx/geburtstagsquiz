# Design-Richtung: Premium Game-Show

## Ziel

Die drei Apps (Display/TV, Host, Player) sollen als zusammenhängendes System wirken –
ruhig, hochwertig und klar, nicht neonlastig oder cyberpunk-artig.

## Rollen

| App             | Rolle      | Charakter                                                     |
| --------------- | ---------- | ------------------------------------------------------------- |
| **web-display** | Bühne      | Groß, lesbar aus 3–4 m, klare Hierarchie, wenig Meta-Rauschen |
| **web-host**    | Regiepult  | Übersichtlich, primäre Aktion immer sichtbar, ruhige Panels   |
| **web-player**  | Controller | Kompakt, ein-Hand-bedienbar, klare Zustandsanzeige            |

## Styling-Stand

Es gibt kein Tailwind und kein zentrales Shared-CSS-Package. Jede App hat ihre eigene CSS-Datei:

- `apps/web-display/src/styles.css`
- `apps/web-host/src/styles.css`
- `apps/web-player/src/styles.css`

Die Apps verwenden aehnliche Kernfarben, aber app-lokale Token-Namen. Bei UI-Aenderungen zuerst die betroffene App-Datei pruefen und keine neue globale Designschicht einfuehren.

## Farbpalette (tatsaechliche Basis)

| Konzept | Aktuelle Token-Beispiele | Verwendung |
| --- | --- | --- |
| Hintergrund | `--bg-black`, `--display-bg`, `--host-bg-top`, `--player-bg` | dunkle Grundflaeche |
| Panel/Card | `--bg-card`, `--display-bg-card`, `--host-panel`, `--player-bg-card` | Cards, Panels, Regie-Flaechen |
| Primaerer Akzent | `--accent-gold`, `--display-gold`, `--host-gold`, `--player-accent` | CTA, Join-Code, Score, aktive Elemente |
| Sekundaerer Akzent | `--accent-cyan`, `--display-accent`, `--host-cyan`, `--player-cyan` | Fortschritt, Info, sekundare Hervorhebung |
| Erfolg | `--color-success`, `--display-green`, `--host-green`, `--player-green` | richtig, verbunden, positiv |
| Fehler | `--color-error`, `--display-red`, `--host-red`, `--player-red` | falsch, kritisch, Fehler |
| Warnung | `--display-warning`, `--host-amber`, `--player-amber` | Timer-Warnung, Reconnect, Aufmerksamkeit |
| Text | `--display-ink`, `--host-ink`, `--player-ink` | primaerer Text |
| Text soft | `--display-ink-soft`, `--host-ink-soft`, `--player-ink-soft` | sekundarer Text |
| Linien | `--solid-border`, `--display-line`, `--host-line`, `--player-line` | Borders und Trennlinien |

## Motion-System

| Token          | Wert                          | Verwendung                     |
| -------------- | ----------------------------- | ------------------------------ |
| `--dur-fast`   | `150ms`                       | Hover, kleine State-Wechsel    |
| `--dur-normal` | `250ms`                       | Screen-Übergänge, Modal-öffnen |
| `--dur-slow`   | `400ms`                       | Reveal, Scoreboard-Einblendung |
| `--dur-scene`  | `600ms`                       | Podium, finale Einblendungen   |
| `--ease-out`   | `cubic-bezier(0.22,1,0.36,1)` | Standard für alle Übergänge    |

Alle Apps implementieren `@media (prefers-reduced-motion: reduce)` mit deaktivierten
Animationen und Transitions.

## Typografie

- **Orbitron** nur für: Join-Code, Timer-Zahlen, Score-Zahlen (groß), Podium-Ränge
- Alle anderen Texte: System-UI-Stack (`system-ui, -apple-system, "Segoe UI", ...`)
- Weniger `text-transform: uppercase` – nur Join-Code und Timer

## Glow-Effekte

Glow/Neon-Effekte nur für echte Spielmomente:

- Aktiver Timer in kritischer Phase (urgent)
- Richtige Antwort beim Reveal
- Rang 1 / Gewinner
- Primärer CTA-Button

**Nicht** für: normale Cards, Labels, Panels, Hintergründe, Status-Dots im Normalzustand.

## Regeln

- Kein neues Produktdesign ohne expliziten Auftrag
- Kein `@import` von Shared-CSS-Packages (jede App bleibt eigenständig)
- Spielbarkeit und Lesbarkeit haben immer Vorrang vor visuellen Effekten
- TV-Lesbarkeit: Frage + Antworten müssen aus 3 m klar erkennbar sein
