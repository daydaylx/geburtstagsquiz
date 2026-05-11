# Pre-Party-Checklist

Kompakte Checkliste fuer den Quiz-Abend. Reihenfolge einhalten.

## 30 Minuten vorher

- [ ] `node --version` pruefen (>=20)
- [ ] `corepack pnpm install --frozen-lockfile`
- [ ] `corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` — alles muss gruen sein
- [ ] Keine alten Prozesse auf den Ports: `ss -tlnp | grep -E '3001|5173|5174|5175'` (sollte leer sein)
- [ ] Laptop: Bildschirm auf "Niemals sperren" und "Nicht in den Ruhezustand"
- [ ] HDMI-TV/Monitor angeschlossen und als zweiter Bildschirm erkannt
- [ ] Wenn Spieler per Handy beitreten sollen:
  - [ ] Cloudflare Tunnel starten: `cloudflared tunnel --config .cloudflared/config.yml run quiz &`
  - [ ] Warten bis 4 "Registered tunnel connection" Logs erscheinen
  - [ ] `curl -s https://api.quiz.disaai.de/health` muss `{"ok":true}` liefern
  - [ ] Dann `./quiz.sh` → "Hybrid" waehlen
- [ ] Wenn nur lokal (QR nur vom Laptop scanbar): `./quiz.sh` → "Lokal"

## 10 Minuten vorher

- [ ] `./quiz.sh` starten und Modus waehlen
- [ ] Dashboard zeigt 4 gruene Haekchen
- [ ] Host oeffnet sich im Browser (`http://localhost:5173`)
- [ ] Raum erstellen im Host
- [ ] "Display oeffnen" klicken → TV-Fenster oeffnet sich
- [ ] TV-Fenster auf HDMI-Bildschirm ziehen, F11 fuer Vollbild
- [ ] QR-Code auf dem TV pruefen
- [ ] Ein Test-Player scannt QR und tritt bei
- [ ] Demo-Frage durchspielen: Antwort absenden → Fortschrittsbalken auf TV → Reveal

## Waehrend des Abends

- Terminal mit `quiz.sh` im Blick behalten — es meldet gecrashte Prozesse
- Player-Disconnect: 30s Reconnect-Frist, dann wird der Spieler entfernt
- Display-Disconnect (HDMI-Wackler): 45s Frist, dann Raum geschlossen
- Host-Browser-Crash: 5 Min Frist — einfach Seite neu laden
- "Neues Spiel" nach Spielende: Host-Seite einfach neu laden
- Logs bei Bedarf: `${XDG_RUNTIME_DIR:-/tmp}/geburtstagsquiz/logs/`

## Fallback

Wenn `quiz.sh` nicht funktioniert, einzeln starten:

```bash
corepack pnpm --filter @quiz/server run dev          # Terminal 1
corepack pnpm --filter @quiz/web-host run dev         # Terminal 2
corepack pnpm --filter @quiz/web-display run dev      # Terminal 3
corepack pnpm --filter @quiz/web-player run dev       # Terminal 4
```

Dann manuell `http://localhost:5173` im Browser oeffnen.

## Tunnel stoppen (nach dem Abend)

```bash
pkill -f "cloudflared tunnel"
```
