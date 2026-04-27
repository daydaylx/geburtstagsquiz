# 11 - Risiken und Entscheidungen

## Kritische Bewertung des Konzepts

Das Konzept ist sinnvoll. Die Trennung in TV/Display, Host Controller und Player loest ein echtes Problem: Die aktuelle Host-App ist gleichzeitig Buehne und Steuerpult. Fuer einen Abend mit TV und Host-Handy ist das unpraktisch.

Die wichtigste technische Aenderung ist aber nicht die neue Display-App. Der Kern ist:

```text
display als eigene Rolle mit eigener Session und read-only Rechten
hostToken als einmaliges Pairing-Mittel, klar getrennt von hostSessionId
Display initialisiert den Raum, nicht der Host
```

Ohne diese Basis waere eine neue UI nur Fassade und koennte Rollen-/Reconnect-Probleme verdecken.

---

## Technische Risiken

### 1. Host-first/Display-first-Verwechslung

Risiko:

- Ein Agent oder Entwickler setzt wieder das alte Modell um: Host oeffnet Seite, Host erstellt Raum, Display verbindet sich per Display-Link.
- Das alte Modell sieht aehnlich aus, ist aber konzeptionell falsch fuer diesen Anwendungsfall.

Symptome:

- `room:create` wird von Host-App gesendet.
- Host-App hat kein `?hostToken=`-Parsing.
- Display-App bekommt `displayToken` per Link vom Host.

Gegenmaßnahme:

- Alle Folgeprompts enthalten explizit: Display erstellt Raum, Host koppelt per hostToken.
- Jeder Codecheck: Gibt es `room:create` in der Host-App? -> Falsch.

### 2. hostToken wird mit hostSessionId verwechselt

Risiko:

- Code verwendet `hostToken` als Session-Credential fuer Reconnect.
- Oder `hostSessionId` wird als Pairing-Token ins QR kodiert.
- Beide sind nicht dasselbe und duerfen nicht austauschbar sein.

Konsequenz:

- Security-Problem: ein veroeffentlichter QR koennte Reconnect ermoglichen.
- Oder: ein bereits benutzter Pairing-Token wird faelschlich fuer Reconnect abgelehnt.

Entscheidung:

- `hostToken`: kurze Lebenszeit, einmaliger Pairing-Token, nach Pairing als benutzt markieren oder invalidieren.
- `hostSessionId`: vergeben nach Pairing, nur fuer `connection:resume`, nicht im QR.
- Server prueft: `hostTokenUsed`-Flag verhindert zweites Pairing.

### 3. Display-Reload erzeugt neuen Raum

Risiko:

- Display-App erstellt bei jedem Seitenlade automatisch einen neuen Raum.
- Laufendes Spiel wird damit zerstoert.

Gegenmaßnahme:

- Kein Auto-Create bei Seitenlade. Button "Quizraum erstellen" ist Pflicht.
- Display prueft bei Laden: Liegt `displaySessionId` im Storage? -> Reconnect versuchen, nicht neuen Raum erstellen.

Entscheidung:

- Display erstellt Raum per Button, nicht automatisch.
- Begruendung: Verhindert versehentliche Raumzerstoerung bei Reload, bleibt aber fast so bequem wie Auto-Create.

### 4. Host-QR bleibt sichtbar und ein anderes Geraet koppelt sich

Risiko:

- Nach dem Host-Pairing ist der Host-QR noch auf dem TV sichtbar.
- Ein anderes Geraet scannt ihn und versucht sich als Host zu koppeln.

Gegenmaßnahme:

- Nach erfolgreichem Host-Pairing: Server markiert `hostTokenUsed=true`.
- Server lehnt zweites `host:connect` mit bereits benutztem Token ab.
- Display blendet Host-QR aus nach `display:host-paired` Event.
- Doppelte Sicherheit: Token-Invalidierung + QR-Ausblenden.

Entscheidung:

- Host-QR wird nach Kopplung auf TV ausgeblendet oder stark minimiert.
- `hostToken` wird einmalig verwendet und danach als benutzt markiert.
- Optional: "Host neu koppeln" nur auf explizite Aktion sichtbar (z.B. nach Timeout oder Trennung).

### 5. Session-Verdraengung zwischen Display und Host

Risiko:

- Display und Host teilen versehentlich eine Session.
- `attachSocketToSession` schliesst dann das falsche Geraet.

Entscheidung:

- Display bekommt eigene `displaySessionId` und `displayToken`.
- Host bekommt eigene `hostSessionId` nach Pairing.
- Die beiden Tokens sind nie identisch und werden auf komplett getrennten Feldern im RoomRecord gespeichert.

### 6. Broadcast-Leaks

Risiko:

- Player bekommt volle Frage statt Controller-Payload.
- Display bekommt Steuer- oder private Playerdaten.
- Host bekommt nicht mehr genug Status.

Entscheidung:

- Broadcasts werden explizit nach Host, Display und Player getrennt.
- Jedes Event wird bewusst einer Zielgruppe zugeordnet.
- Display bekommt `question:show`, nicht `question:controller`.

### 7. Reconnect-Snapshot

Risiko:

- `syncSessionToRoomState` ist gross und zustandsabhaengig.
- Display-Reconnect im Reveal oder Scoreboard kann falsche Reihenfolge von Events bekommen.

Entscheidung:

- Display-Snapshot-Regeln pro GameState testen.
- Keine neue Recovery-Architektur bauen, nur aktuellen Snapshot sauber liefern.

### 8. Zwei Host-Geraete versuchen sich zu koppeln

Risiko:

- Zwei Handys scannen gleichzeitig den Host-QR.
- Beide senden `host:connect` fast gleichzeitig.
- Server verarbeitet beide.

Entscheidung:

- Erstes `host:connect` gewinnt und setzt `hostTokenUsed=true`.
- Zweites `host:connect` bekommt klaren Fehler zurueck.
- Server-seitige Atomaritaet: Token-Flag wird gesetzt, bevor Antwort gesendet wird.

### 9. Domain vor lokaler Stabilitaet

Risiko:

- Cloudflare/WSS-Probleme verschleiern lokale Rollenfehler.

Entscheidung:

- Erst lokal 3 UIs stabil betreiben.
- Dann Cloudflare Tunnel.
- Danach optional Pages + Node Backend.
- Abnahme: Lokaler E2E-Test mit echten Geraeten muss vor Domain-Setup bestanden sein.

### 10. Fragenarbeit als Ablenkung

Risiko:

- Katalogarbeit wird zur Massenproduktion und verdraengt Architekturfixes.

Entscheidung:

- Fragen/Shuffle erst nach Rollen/UI-Trennung (nach Phase 5).
- Qualitaetsreview statt Menge.

### 11. Overengineering

Risiko:

- Aus dem Abendquiz wird eine Plattform.

Entscheidung:

- Keine Accounts.
- Keine Datenbank.
- Keine Adminplattform.
- Keine Durable Objects im ersten Umbau.
- Keine neuen Spielmodi waehrend Architekturumbau.

---

## Offene Entscheidungen

### hostToken-Laenge und Format

Empfehlung:

- Kryptografisch zufaelliges URL-safe Token, min. 32 Bytes (base64url oder hex).
- Kuerzer als UUID reicht nicht fuer Security-relevante Tokens.

### hostToken nach Pairing invalidieren oder nur als benutzt markieren?

Empfehlung:

- Als benutzt markieren (`hostTokenUsed: true`) reicht fuer v1.
- Server lehnt zweites `host:connect` mit klarem Fehler ab.
- Display blendet QR aus. Doppelte Sicherung.

### "Host neu koppeln" - wie?

Empfehlung fuer v1:

- Wenn Host sich trennt und Reconnect fehlschlaegt: Display kann Option "Host neu koppeln" anzeigen.
- Server generiert neuen `hostToken` auf Anfrage von Display.
- Display zeigt neuen Host-QR.
- Nicht automatisch, sondern auf explizite Aktion.

Noch nicht entschieden: Welches Event loest "Host neu koppeln" aus? Fuer v1 Implementierung zurueckstellen.

### Ein oder mehrere Displays

Entscheidung (unveraendert):

- Ein Display.
- Mehrere Displays erst bei echtem Bedarf.

### Display-Grace-Zeit

Empfehlung:

- 30s bis 60s.
- Display-Timeout schliesst Raum nicht.

### Zielverteilung fuer Fragen

Empfehlung:

- Erst nach UI-Trennung entscheiden.
- Vorschlag: 12 MC, 5 Estimate, 4 Logic, 3 Ranking, 3 Majority, 3 OpenText.

### Domainvariante

Empfehlung:

- Zuerst Cloudflare Tunnel.
- Spaeter Pages + Node Backend.
- Durable Objects verschieben.

---

## Bewusste Entscheidungen (kanonisch)

| Entscheidung                                        | Begruendung                                       |
| --------------------------------------------------- | ------------------------------------------------- |
| Display erstellt Raum per Button, nicht Auto-Create | Verhindert Raumzerstoerung bei Reload             |
| Host-QR nach Kopplung ausblenden                    | Verhindert zweites unerwuenschtes Pairing         |
| hostToken einmalig (nach Pairing invalidieren)      | Security: kein Zweitzugang per QR-Screenshot      |
| Display bleibt nach Rauminitialisierung read-only   | Klare Rollentrennung, kein Mischbetrieb           |
| Domain/Cloudflare erst nach lokalem E2E             | Debugging bei Rollenproblemen ist lokal einfacher |
| Kein zweites Display oder zweiter Host in v1        | YAGNI – kein konkreter Bedarf                     |
| Keine Durable Objects in v1                         | Zu hoher Umbauaufwand fuer MVP                    |

---

## Empfohlene Reihenfolge

1. Serverrollen/Protokoll (Display-first + Host-Pairing).
2. Display-App (Setup-Screen + 2 QR-Codes).
3. Host Controller (koppelt per hostToken).
4. Player-Wording/kleine Anpassungen.
5. Fragenmix.
6. Domain/Cloudflare.
7. End-to-End-Test.

## Riskanteste Phase

Phase 2 ist am riskantesten: Serverrollen, Sessions, Reconnect und Broadcasts. Wenn diese Phase falsch wird, koennen alle UIs korrekt aussehen und trotzdem falsche Rechte oder falsche Snapshots haben. Besonders kritisch:

- `hostToken` vs `hostSessionId` Trennung
- `hostTokenUsed`-Flag-Atomaritaet
- Display-Reconnect ohne Host-Verdraengung

## Was verschoben werden sollte

- Cloudflare Pages.
- Durable Objects.
- Animationen.
- Neue Spielmodi.
- Fragen-Massenproduktion.
- Mehrere Displays oder mehrere Hosts.
- Admin-/Moderatorfunktionen.
- "Host neu koppeln"-Flow (erst nach v1).

## Dinge, die bewusst nicht gebaut werden sollen

- Accounts oder Profile.
- Login.
- Datenbank.
- Persistenz nach Serverneustart.
- Teams.
- Joker.
- Buzzer.
- Global Highscores.
- Adminsystem.
- Multi-Tenant-Betrieb.
- Durable Objects im ersten Umbau.
- UI-Animationen vor stabiler Architektur.
