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

## Farbpalette (gemeinsame Basis)

| Token             | Wert                     | Verwendung                                                   |
| ----------------- | ------------------------ | ------------------------------------------------------------ |
| `--base-bg`       | `#08101a`                | Hintergrundfarbe alle Apps                                   |
| `--base-surface`  | `#111827`                | Card-Oberflächen                                             |
| `--base-gold`     | `#f6c76a`                | **Primärer Akzent** – CTA, Join-Code, Score, aktive Elemente |
| `--base-cyan`     | `#38bdf8`                | **Sekundärer Akzent** – Fortschrittsbalken, Info-Labels      |
| `--base-green`    | `#22c55e`                | Richtig / Verbunden / Positiv                                |
| `--base-red`      | `#ef4444`                | Falsch / Fehler / Kritisch                                   |
| `--base-amber`    | `#f59e0b`                | Warnung / Reconnecting                                       |
| `--base-ink`      | `#f0f0f0`                | Primärer Text                                                |
| `--base-ink-soft` | `rgba(240,240,240,0.55)` | Sekundärer Text                                              |
| `--base-line`     | `rgba(255,255,255,0.08)` | Trennlinien, Borders                                         |
| `--base-radius`   | `8px`                    | Standard-Border-Radius                                       |

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
