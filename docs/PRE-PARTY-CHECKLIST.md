# Pre-Party-Checklist

Kompakte Checkliste fuer den Quiz-Abend. Reihenfolge einhalten.

## 30 Minuten vorher

- [ ] `node --version` pruefen (>=20)
- [ ] `corepack pnpm install --frozen-lockfile`
- [ ] `corepack pnpm typecheck && corepack pnpm test && corepack pnpm build` — alles muss gruen sein
- [ ] Keine alten Prozesse auf den Ports: `ss -tlnp | grep -E '3001|5173|5174|5175'` (sollte leer sein)
- [ ] `cloudflared --version` funktioniert
- [ ] `.cloudflared/config.yml` ist vorhanden und zeigt auf `3001`, `5173`, `5174`, `5175`
- [ ] Laptop: Bildschirm auf "Niemals sperren" und "Nicht in den Ruhezustand"
- [ ] HDMI-TV/Monitor angeschlossen und als zweiter Bildschirm erkannt
- [ ] `./quiz.sh` starten; es startet Server, Frontends und Cloudflare Tunnel automatisch
- [ ] `curl -s https://api.quiz.disaai.de/health` muss `{"ok":true}` liefern

## 10 Minuten vorher

- [ ] Dashboard zeigt Server, TV-Display, Host, Spieler und Tunnel gruen
- [ ] Host oeffnet sich im Browser (`https://host.quiz.disaai.de`)
- [ ] Raum erstellen im Host
- [ ] "Display oeffnen" klicken → TV-Fenster oeffnet sich
- [ ] TV-Fenster auf HDMI-Bildschirm ziehen, F11 fuer Vollbild
- [ ] QR-Code auf dem TV pruefen
- [ ] Ein Test-Player scannt QR und tritt bei
- [ ] Demo-Frage durchspielen: Antwort absenden → Fortschrittsbalken auf TV → Reveal

## Waehrend des Abends

- Terminal mit `quiz.sh` im Blick behalten — es meldet gecrashte Prozesse
- Player-Disconnect: 30s Reconnect-Frist, dann wird der Spieler entfernt
- Display-Disconnect (HDMI-Wackler): 45s Frist/Warnung, Raum laeuft weiter
- Host-Browser-Crash: 5 Min Frist — einfach Seite neu laden
- "Neues Spiel" nach Spielende: Host-Seite einfach neu laden
- Logs bei Bedarf: `${XDG_RUNTIME_DIR:-/tmp}/privatquiz/logs/`

## Fallback

Wenn `quiz.sh` nicht funktioniert, einzeln starten:

```bash
corepack pnpm --filter @quiz/server run dev          # Terminal 1
corepack pnpm --filter @quiz/web-host run dev         # Terminal 2
corepack pnpm --filter @quiz/web-display run dev      # Terminal 3
corepack pnpm --filter @quiz/web-player run dev       # Terminal 4
cloudflared tunnel --config .cloudflared/config.yml run quiz
```

Dann manuell `https://host.quiz.disaai.de` im Browser oeffnen.

## Tunnel stoppen (nach dem Abend)

```bash
pkill -f "cloudflared tunnel"
```
