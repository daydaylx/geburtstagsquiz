# 04 - UI-Umbauplan

## Ziel

Die bestehende Host-App wird zur Controller-App. Eine neue Display-App uebernimmt die oeffentliche Anzeige. Die Player-App bleibt schlank und wird nur dort angepasst, wo Protokoll oder wording betroffen sind.

## Neue UI-Aufteilung

```text
apps/web-display  -> grosse Anzeige fuer TV/Beamer
apps/web-host     -> kompakter Controller fuer Host
apps/web-player   -> Spieler-Handy
```

## Display-App

Neue App: `apps/web-display`

Empfohlenes technisches Muster:

- React 19 + Vite wie Host und Player.
- Keine neuen Dependencies.
- Lokale `storage.ts` fuer Display-Session.
- `useEffectEvent` beibehalten, wenn analog zu bestehenden Apps.
- QR-Code ist fuer Display nicht zwingend, weil Host den Player-QR zeigt.

### Display-Screens

- Not connected: kein Token oder Verbindung verloren.
- Lobby: Quizname, Join-Code, Player-QR/Link, Spielerzahl, Host-/Displaystatus.
- Question: Frage, Optionen/Items/Unit, Timer, Antwortfortschritt, Frage x/y.
- Reveal: richtige Antwort, markierte Option/Ranking/Number/Text, Erklaerung, richtig/falsch/fehlend.
- Scoreboard: Rangliste, Top 3, Fortschritt.
- Finished: Gewinner, finale Rangliste.
- Connection lost: klarer Status ohne Steueraktionen.

### Display-Regeln

- Keine Buttons fuer Spielsteuerung.
- Keine Settings.
- Keine Antwortformulare.
- Keine Player-Ready-Aktion.
- Grosse, stabile Layouts.
- TV-Lesbarkeit vor Dekoration.
- Keine Animationen in der ersten Display-Version.

## Host Controller

`apps/web-host` wird umgebaut von Stage+Controller zu Controller.

### Host-Screens

- Create Room.
- Room Ready.
- Lobby Control.
- Question Control.
- Reveal Control.
- Scoreboard Control.
- Settings.
- Finished.
- Emergency / Recovery.

### Host-Funktionen

- Raum erstellen.
- Player-Link und Player-QR anzeigen.
- Display-Link anzeigen.
- Display-Verbindungsstatus anzeigen.
- Spiel starten.
- Antwortfortschritt sehen.
- Spielerstatus sehen.
- Einstellung `showAnswerTextOnPlayerDevices` in Lobby setzen.
- Nach Scoreboard manuell naechste Frage ausloesen.
- Raum schliessen.
- Nach Finished neues Spiel starten, ohne alte Session unklar weiterzuverwenden.

### Was aus der Host-App herausgezogen wird

In die Display-App gehoeren:

- grosse Join-Code-Buehne.
- grosse Fragekarte.
- Antwortoptions-Grid fuer TV.
- Reveal-Buehne.
- grosse Scoreboard-Anzeige.
- finale TV-Ansicht.

Im Host bleiben:

- kompakte Frage-/Statusvorschau.
- Steuerbuttons.
- Spielerlisten.
- Fehlermeldungen.
- Links und QR.
- Recovery-Status.

## Player-App

`apps/web-player` bleibt im Kern unveraendert.

Gezielte Anpassungen:

- Text "Schau auf den Host-Bildschirm" auf "Schau auf den Display-Bildschirm" oder neutral "Schau nach vorne" aendern.
- Reveal-Erklaerung beibehalten.
- Reconnect-Status pruefen, aber keine neue Recovery-Logik bauen.
- Keine Host-/Display-Funktionen hinzufuegen.

## URL- und Storage-Regeln

Host:

- Speichert `roomId`, `hostSessionId`.
- Baut Player-Link aus `VITE_PLAYER_JOIN_BASE_URL`.
- Baut Display-Link aus `VITE_DISPLAY_URL`.

Display:

- Liest `displayToken` aus Query.
- Speichert `roomId`, `displaySessionId`, optional `displayToken`.
- Verbindet mit `VITE_SERVER_SOCKET_URL`.

Player:

- Liest `joinCode` aus Query.
- Speichert bisherige Player-Session.
- Verbindet mit `VITE_SERVER_SOCKET_URL`.

## UI-Anforderungen

### Mobile Host

- Grosse Buttons.
- Kein Dreispalten-TV-Layout.
- Kritische Aktionen klar unterscheidbar.
- Status immer sichtbar.
- Kein Scrollchaos im Kernfluss.

### TV Display

- Grosse Schrift.
- Keine kleinen Sidebars als Hauptinformation.
- Timer und Frage jederzeit eindeutig.
- Scoreboard aus Distanz erfassbar.
- Keine Overlays, die Frage oder Antworten verdecken.

### Player

- Touchflaechen gross.
- Wenig Text.
- Antwort gespeichert klar sichtbar.
- Ranking-Eingabe verstaendlich.
- Kernflow auch auf kleinen Smartphones nutzbar.

## Grenzen gegen Overengineering

- Keine Design-System-Einfuehrung.
- Keine Routing-Library.
- Keine globale State-Library.
- Keine Animationen vor stabiler Rollenarchitektur.
- Keine komplexen Admin-Views.
- Keine Moderator- oder Multiroom-Funktionen.

## Abnahme

- Host kann das Spiel komplett steuern, ohne TV-Anzeige zu sein.
- Display kann den kompletten Ablauf anzeigen, ohne irgendeine Aktion auszufuehren.
- Player koennen wie bisher joinen, antworten und Ready senden.
- Alle drei Apps laufen lokal parallel.

