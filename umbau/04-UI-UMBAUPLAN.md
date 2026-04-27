# 04 - UI-Umbauplan

## Ziel

Die bestehende Host-App wird zur Controller-App (koppelt per `hostToken`, erstellt keinen Raum). Eine neue Display-App initialisiert den Raum per Button und zeigt danach die oeffentliche Anzeige. Die Player-App bleibt schlank und wird nur dort angepasst, wo Protokoll oder Wording betroffen sind.

## Neue UI-Aufteilung

```text
apps/web-display  -> TV/Beamer: Rauminitialisierung + oeffentliche Anzeige
apps/web-host     -> Handy: mobiler Controller (koppelt per Host-QR)
apps/web-player   -> Handy: Spieler-UI
```

## Display-App

Neue App: `apps/web-display`

Empfohlenes technisches Muster:

- React 19 + Vite wie Host und Player.
- Keine neuen Dependencies.
- Lokale `storage.ts` fuer Display-Session.
- `useEffectEvent` beibehalten, wenn analog zu bestehenden Apps.

### Display-Screens

**Setup-Screen (vor Rauminitialisierung):**

- Grosser Button "Quizraum erstellen".
- Kein Auto-Create bei Seitenlade (wuerde bei Reload neuen Raum erzeugen).
- Optional: Feld fuer existierende `displayToken`-basierte Wiederverbindung.

**Lobby-Screen (nach Rauminitialisierung, vor Host-Pairing):**

- Grosser Player-QR (`play.<domain>?joinCode=XXX`).
- Join-Code als Text darunter.
- Grosser Host-QR (`host.<domain>?hostToken=YYY`) prominent daneben oder darunter.
- Status "Host noch nicht verbunden – bitte Host-QR scannen".
- Spieleranzahl.

**Lobby-Screen (nach Host-Pairing):**

- Grosser Player-QR bleibt sichtbar.
- Host-QR wird ausgeblendet oder stark minimiert.
- Status "Host verbunden".
- Spieleranzahl.
- Optional: "Host neu koppeln"-Link nur auf explizite Anfrage sichtbar.

**Spielscreens (TV-Buehne):**

- Question: Frage, Antwortoptionen/Items/Unit, Timer, Antwortfortschritt, Frage x/y.
- Reveal: richtige Antwort, markierte Option/Ranking/Number/Text, Erklaerung, richtig/falsch/fehlend.
- Scoreboard: Rangliste, Top 3, Fortschritt.
- Finished: Gewinner, finale Rangliste.

**Verbindungsstatus-Screen:**

- Connection lost: klarer Status ohne Steueraktionen.
- Kein Panik-Button, nur Information.

### Display-Regeln

- Keine Buttons fuer Spielsteuerung.
- Keine Settings.
- Keine Antwortformulare.
- Keine Player-Ready-Aktion.
- Grosse, stabile Layouts.
- TV-Lesbarkeit vor Dekoration.
- Keine Animationen in der ersten Display-Version.
- Display sendet nach `display:room-created` niemals Host-Events.

### Display URL- und Storage-Logik

- Oeffnet `tv.<domain>` ohne Parameter.
- Speichert `roomId`, `displaySessionId`, optional `displayToken` nach Rauminitialisierung.
- Reconnect: sendet `connection:resume` mit `displaySessionId` und `roomId`.
- Verbindet mit `VITE_SERVER_SOCKET_URL`.
- Zeigt Player-QR und Host-QR aus `joinCode` und `hostToken` der `display:room-created`-Antwort.
- Blendet Host-QR aus nach `display:host-paired` Event vom Server.

## Host Controller

`apps/web-host` wird umgebaut: kein Raum erstellen mehr, stattdessen Host-Pairing per `hostToken`.

### Host-Startflow

1. Host scannt Host-QR auf dem TV -> landet auf `host.<domain>?hostToken=YYY`.
2. Host-App liest `hostToken` aus Query.
3. Host-App sendet `host:connect` mit `hostToken`.
4. Server antwortet mit `host:connected` und `hostSessionId`.
5. Host-App speichert `hostSessionId` fuer Reconnect.
6. Host sieht Lobby-Controller.

### Host-Screens

- Pairing-Screen (laedt `hostToken` aus Query, zeigt Verbindungsfortschritt).
- Lobby Control (Spielerstatus, Einstellungen, Start-Button).
- Question Control.
- Reveal Control.
- Scoreboard Control.
- Settings.
- Finished.
- Emergency / Recovery.

### Host-Funktionen

- Per `hostToken` aus Query koppeln.
- Spielerstatus sehen.
- Display-Verbindungsstatus sehen.
- Spiel starten.
- Antwortfortschritt sehen.
- Einstellung `showAnswerTextOnPlayerDevices` in Lobby setzen.
- Nach Scoreboard manuell naechste Frage ausloesen.
- Raum schliessen.
- Nach Finished: Hinweis auf neues Spiel (kein Auto-Restart).

### Was aus der Host-App entfernt wird

- Raum-erstellen-Flow (gehoert jetzt zum Display).
- Grosse Stage-Ansicht fuer Fragen und Antworten.
- QR-Code-Anzeige fuer Display-Link (Display erstellt jetzt selbst).
- TV-taugliche Layouts.

### Was im Host bleibt

- Kompakte Frage-/Statusvorschau.
- Steuerbuttons.
- Spielerlisten.
- Fehlermeldungen.
- Player-Link und Player-QR als Info (Display zeigt auch QR, aber Host kann als Backup dienen).
- Recovery-Status.

### Host URL- und Storage-Logik

- Liest `hostToken` aus Query-Parameter.
- Nach Pairing: speichert `roomId`, `hostSessionId`.
- Reconnect: sendet `connection:resume` mit `hostSessionId` und `roomId`.
- Verbindet mit `VITE_SERVER_SOCKET_URL`.

### Mobile Host-Anforderungen

- Grosse Buttons.
- Kein Dreispalten-TV-Layout.
- Kritische Aktionen klar unterscheidbar.
- Status immer sichtbar.
- Kein Scrollchaos im Kernfluss.

## Player-App

`apps/web-player` bleibt im Kern unveraendert.

Gezielte Anpassungen:

- Text "Schau auf den Host-Bildschirm" auf "Schau auf den Bildschirm vorne" oder "Schau aufs TV" aendern.
- Reveal-Erklaerung beibehalten.
- Reconnect-Status pruefen, aber keine neue Recovery-Logik bauen.
- Keine Host-/Display-Funktionen hinzufuegen.

### Player URL- und Storage-Logik (unveraendert)

- Liest `joinCode` aus Query.
- Speichert bisherige Player-Session.
- Verbindet mit `VITE_SERVER_SOCKET_URL`.

## TV Display Anforderungen

- Grosse Schrift.
- Keine kleinen Sidebars als Hauptinformation.
- Timer und Frage jederzeit eindeutig.
- Scoreboard aus Distanz erfassbar.
- Keine Overlays, die Frage oder Antworten verdecken.
- Host-QR und Player-QR gleichzeitig sichtbar in Lobby (vor Host-Pairing).

## Grenzen gegen Overengineering

- Keine Design-System-Einfuehrung.
- Keine Routing-Library.
- Keine globale State-Library.
- Keine Animationen vor stabiler Rollenarchitektur.
- Keine komplexen Admin-Views.
- Keine Moderator- oder Multiroom-Funktionen.

## Abnahme

- Display kann Raum erstellen per Button, zeigt Player-QR und Host-QR.
- Host scannt Host-QR, koppelt sich, steuert das Spiel.
- Host-QR verschwindet auf dem TV nach Kopplung.
- Display zeigt kompletten Ablauf, fuehrt keine Aktion aus.
- Player koennen wie bisher joinen, antworten und Ready senden.
- Alle drei Apps laufen lokal parallel.
- Kein Geraet verdraengt das andere aus der Session.
