# Phase 4: Typografische Hierarchie

## Änderungen in `apps/web-display/src/styles.css`

### 4.1 Meta-Zeile dezenter
**Zeile 759–766:**
```css
/* VON: */
font-weight: 700;

/* ZU: */
font-weight: 600;
opacity: 0.6;
```

### 4.2 Fragetext als Hero
**Zeile 775–779:**
```css
/* VON: */
font-weight: 700;
line-height: 1.22;

/* ZU: */
font-weight: 800;
line-height: 1.28;
```

### 4.3 Options-Text lesbarer
**Zeile 833–838:**
```css
/* VON: */
line-height: 1.22;

/* ZU: */
line-height: 1.3;
```

### 4.4 Ranking-Label normalisieren
**Zeile 946–952:**
```css
/* VON: */
font-weight: 650;
line-height: 1.22;

/* ZU: */
font-weight: 600;
line-height: 1.3;
```

### 4.5 Erklärungstext mehr Luft
**Zeile 1285–1289:**
```css
/* VON: */
line-height: 1.5;

/* ZU: */
line-height: 1.55;
```

### 4.6 Orbitron-Nutzung bereinigen
**Zeile 1580–1586 (`.display-finished h1`):**
```css
/* ENTFERNEN: */
font-family: var(--font-display);
```

**Zeile 2807–2812 (`.display-winner-moment p`):**
```css
/* ENTFERNEN: */
font-family: var(--font-display);
```

### 4.7 Scoreboard-Name weniger dominant
**Zeile 2672–2681:**
```css
/* VON: */
font-weight: 800;

/* ZU: */
font-weight: 700;
```

## Orbitron-Nutzung nach Phase 4 (nur noch für Daten/Zahlen)
- `.display-join-code` ✓
- `.display-player-count-number` ✓
- `.display-timer` ✓
- `.display-timer-label` ✓
- `.display-score` ✓
- `.display-podium-rank-badge` ✓
- `.display-podium-score` ✓
- `.display-reveal-stat strong` ✓
- `.display-rank strong` ✓
- `.display-finished h1` ✗ (entfernt)
- `.display-winner-moment p` ✗ (entfernt)
