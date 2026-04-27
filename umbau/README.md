# Umbauplanung

Dieser Ordner enthaelt den Umsetzungsplan fuer den Umbau des Geburtstagsquiz von einem aktuellen 2-UI-System zu einer pragmatischen 3-UI-Architektur.

Quelle fuer den Zielwunsch ist `umbau/anpassung.md`. Der Plan hier korrigiert das Konzept gegen den aktuellen Repo-Stand: `explanation?: string`, Reveal-Erklaerungen, `open_text`, Server-Tests und `getEveningQuestions` existieren bereits teilweise.

## Ziel

Das Projekt soll lokal stabil in drei getrennten Oberflaechen laufen:

- TV / Display UI: oeffentliche Anzeige, read-only, **erstellt den Raum**.
- Host Controller UI: Spielsteuerung fuer den Host per Handy, **koppelt sich per Host-QR**.
- Player UI: Join, Antwort, eigenes Feedback, Ready.

Der Server bleibt die einzige Wahrheit fuer Raum, Rollen, Timer, Antworten, Punkte und Spielzustand.

## Kanonischer Startablauf (Display-first)

```text
1. Laptop ist mit TV verbunden.
2. Nutzer oeffnet tv.<domain> auf dem TV/Laptop.
3. Display zeigt Button "Quizraum erstellen".
4. Nach Klick erstellt der Server Raum + joinCode + hostToken + displayToken.
5. TV zeigt: Player-QR (play.<domain>?joinCode=XXX) und Host-QR (host.<domain>?hostToken=YYY).
6. Spieler scannen Player-QR und treten bei.
7. Host scannt Host-QR mit dem Handy und wird dadurch Controller.
8. Nach Host-Kopplung: Host-QR auf TV ausblenden oder minimieren.
9. TV bleibt reine Anzeige.
10. Host-Handy steuert das Spiel.
11. Player-Handys beantworten Fragen.
```

**Wichtig:** Kein Host oeffnet zuerst eine eigene Seite. Das TV initialisiert den Raum.

## Reihenfolge

1. Architektur und Regeln festziehen.
2. Serverrollen und Protokoll fuer `display` ergaenzen (inkl. `display:create-room` und `host:connect`).
3. Display-App lokal minimal bauen (Setup-Screen + 2 QR-Codes).
4. Host-App zum Controller umbauen (koppelt per `hostToken`, erstellt keinen Raum mehr).
5. Player-App nur gezielt anpassen.
6. Fragen, Shuffle und Erklaerungen pruefen und verbessern.
7. Domain/Cloudflare erst nach lokaler Stabilitaet.
8. End-to-End-Test auf echten Geraeten.

## Harte Regeln

- Server bleibt authoritative.
- Display initialisiert den Raum (nicht Host).
- Display ist nach Rauminitialisierung read-only.
- Host ist Controller – koppelt sich per `hostToken`, erstellt keinen Raum.
- Player darf nur antworten und Ready senden.
- Keine UI bekommt Rechte, die sie nicht braucht.
- Keine Display-Session darf Host-Session verdraengen.
- Host-Session darf Display-Session nicht verdraengen.
- Kein Umbau ohne Tests.
- Keine Domain-Umstellung, bevor lokal alles funktioniert.
- Keine Durable-Objects-Migration im ersten Umbau.
- Keine neuen Spielmodi waehrend des Architekturumbaus.
- Keine Fragenkatalog-Massenproduktion ohne Qualitaetspruefung.
- Keine Animationen vor stabiler Architektur.
- Keine parallelen Grossumbauten.

## Token-Konzept (kanonisch)

```text
joinCode        kurzer Code fuer Player (im Player-QR)
hostToken       langer nicht-erratbarer Token (im Host-QR), nur fuer initiales Host-Pairing
hostSessionId   entsteht nach erfolgreichem Host-Pairing, wird fuer Host-Reconnect genutzt
displayToken    fuer Display-Reconnect
displaySessionId eigene Session fuer das TV-Display
```

`hostToken` ist NICHT identisch mit `hostSessionId`.
`displayToken` ist NICHT fuer Host-Steuerung verwendbar.
`joinCode` ist NICHT fuer Host- oder Display-Rechte verwendbar.

## Pflichtkommandos nach spaeteren Codeaenderungen

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Wichtigste Empfehlung

Nicht mit Cloudflare anfangen. Erst lokal die Rollen, Sessions, Broadcasts und UIs sauber trennen. Danach ist Domainbetrieb deutlich risikoaermer.
