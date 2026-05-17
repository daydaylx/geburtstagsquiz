# Grenzen und praktische Risiken

## Zweck

Dieses Dokument beschreibt die realen Grenzen fuer einen Quiz-Abend.

Es geht nicht um Produkt-Compliance, Cloud-Betrieb oder grosse Lastszenarien, sondern um das, was heute wirklich stoeren kann.

## Wichtige Risiken und pragmatische Entscheidungen

| Thema              | Was praktisch schiefgehen kann                   | Entscheidung fuer dieses Repo                                                   |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| Server-Neustart    | Raum und Spielstand sind weg                     | akzeptiert; kein Persistenzsystem bauen, Server vor dem Abend nicht neu starten |
| Schlechtes WLAN    | Spieler verlieren kurz die Verbindung            | Session-Resume und Grace-Zeiten nutzen, aber stabiles WLAN bevorzugen           |
| Host-Tab geht zu   | gemeinsamer Ablauf steht                         | Host bekommt Grace-Zeit, aber kein grosses Pause-/Recovery-System               |
| Doppeltes Absenden | gleiche Antwort kommt mehrfach                   | Client sperrt nach Send, Server wertet nur die erste gueltige Antwort           |
| Spaete Antworten   | Antwort kommt nach Timerende                     | Server sperrt bei `question:close`, spaete Antworten zaehlen nicht              |
| Mobile Browser     | kleine Displays, Sleep, wechselnde Netzqualitaet | UI schlicht halten, echte Handytests wichtiger als mehr CSS-Effekte             |
| Zu grosser Scope   | Zusatzideen verursachen neue Fehler              | vor dem Abend Scope einfrieren und keine neuen Systeme beginnen                 |
| Tunnel/DNS         | Domainarbeit kann bestehende Deployments stoeren | bestehende Tunnel-Config nutzen; keine DNS-/Routing-/Secret-Aktion ohne `[CONFIRM]` |

## Was bewusst klein bleibt

- In-Memory-State statt Persistenz
- ein vorbereiteter Abendablauf statt Modussammlung
- manuelles Vorbereiten des Quiz statt Editor-Ausbau
- lokale Zielservices mit Cloudflare Tunnel als oeffentlichem Einstieg statt Infra-Setup
- pragmatischer Snapshot-Resume statt komplexer Wiederherstellungslogik

## Was fuer dieses Repo nicht relevant ist

- Accounts und Profile
- Cloud-Speicherung
- GDPR-, SaaS- oder Plattformfragen
- Cluster, Load-Balancer und Monitoring-Stack
- Admin- und Moderationsfunktionen
- globale Highscores
- Lasttests fuer grosse Nutzerzahlen
- Produkt-Roadmaps
- Aenderungen an `disaai.de`, `www.disaai.de` oder bestehenden Disa-AI-Deployments

## Was trotzdem Pflicht bleibt

Auch fuer ein Einmalprojekt sollten diese Punkte nicht aufgeweicht werden:

- Server entscheidet ueber Timer, Antworten und Punkte
- eingehende Events werden validiert
- doppelte Antworten werden abgefangen
- Fehler werden nicht still verschluckt
- der Kernfluss wird auf echten Geraeten ausprobiert

## Bekannte Altlasten und Architektur-Übergänge

| Thema              | Status                                                    | Risiko                                                                                                           |
| ------------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Legacy Room Create | `display:create-room` existiert weiter neben `host:create-room` | Verwirrung in der Code-Wartung; Host-first ist der primaere Pfad, Display-first nur versteckter Fallback. |

## Bewusste Sicherheitsentscheidungen (MVP-Kontext)

| Thema                        | Verhalten                                                                                                                                                                                                                                      | Begründung                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Display-Kopplungstoken | `HOST_ROOM_CREATED` gibt dem Host einen einmaligen `displayConnectToken`, der nur in der Display-Popout-URL steckt. Wer Zugriff auf den Host-Browser hat, kann den Token lesen. | Fuer einen Abend mit Vertrauenspersonen akzeptiert. Das Display wird vom Host aus geoeffnet, und der Token wird nach Kopplung unbrauchbar. |
| Reconnect ohne Secret        | `connection:resume` authentifiziert nur per `sessionId` + `roomId`. Kein zusaetzliches Secret oder Bearer-Token. Wer eine fremde `sessionId` kennt, kann die Session uebernehmen.                                                              | SessionIds sind zufaellige UUIDs. In einem lokalen WLAN ohne externe Angreifer ist dieses Risiko minimal. Fuer einen isolierten Abend akzeptiert. |
| Cloudflare-Credentials       | Tunnel-Credentials und Tokens waeren bei Commit direkt missbrauchbar.                                                                                                                                                                           | Keine echten Secrets ins Repo. Nur Beispiele wie `deploy/cloudflare-tunnel.example.yml` versionieren.                                          |

## Praktische Empfehlungen vor dem Abend

- Hostgeraet ans Ladegeraet
- mindestens zwei echte Handys testen
- Join per QR und per Code einmal durchspielen
- eine komplette Fragerunde mit Antwort, Reveal-Bereitschaft und faelligem Zwischenstand testen
- Browser-Tabs waehrend des eigentlichen Abends moeglichst nicht neu laden
- keine letzten "coolen" Features kurz vorher einbauen

## Schluss

Die groesste Gefahr fuer dieses Repo ist nicht fehlende Enterprise-Haerte, sondern unnötige Komplexitaet kurz vor dem Einsatz.

Stabile Einfachheit ist hier die richtige Grenze.
