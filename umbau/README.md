# Umbauplanung

Dieser Ordner enthaelt den Umsetzungsplan fuer den Umbau des Geburtstagsquiz von einem aktuellen 2-UI-System zu einer pragmatischen 3-UI-Architektur.

Quelle fuer den Zielwunsch ist `umbau/anpassung.md`. Der Plan hier korrigiert das Konzept gegen den aktuellen Repo-Stand: `explanation?: string`, Reveal-Erklaerungen, `open_text`, Server-Tests und `getEveningQuestions` existieren bereits teilweise.

## Ziel

Das Projekt soll lokal stabil in drei getrennten Oberflaechen laufen:

- TV / Display UI: oeffentliche Anzeige, read-only.
- Host Controller UI: Spielsteuerung fuer den Host.
- Player UI: Join, Antwort, eigenes Feedback, Ready.

Der Server bleibt die einzige Wahrheit fuer Raum, Rollen, Timer, Antworten, Punkte und Spielzustand.

## Reihenfolge

1. Architektur und Regeln festziehen.
2. Serverrollen und Protokoll fuer `display` ergaenzen.
3. Display-App lokal minimal bauen.
4. Host-App zum Controller umbauen.
5. Player-App nur gezielt anpassen.
6. Fragen, Shuffle und Erklaerungen pruefen und verbessern.
7. Domain/Cloudflare erst nach lokaler Stabilitaet.
8. End-to-End-Test auf echten Geraeten.

## Harte Regeln

- Server bleibt authoritative.
- Display ist read-only.
- Host ist Controller.
- Player darf nur antworten und Ready senden.
- Keine UI bekommt Rechte, die sie nicht braucht.
- Keine Display-Session darf Host-Session verdraengen.
- Kein Umbau ohne Tests.
- Keine Domain-Umstellung, bevor lokal alles funktioniert.
- Keine Durable-Objects-Migration im ersten Umbau.
- Keine neuen Spielmodi waehrend des Architekturumbaus.
- Keine Fragenkatalog-Massenproduktion ohne Qualitaetspruefung.
- Keine Animationen vor stabiler Architektur.
- Keine parallelen Grossumbauten.

## Pflichtkommandos nach spaeteren Codeaenderungen

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Wichtigste Empfehlung

Nicht mit Cloudflare anfangen. Erst lokal die Rollen, Sessions, Broadcasts und UIs sauber trennen. Danach ist Domainbetrieb deutlich risikoaermer.

