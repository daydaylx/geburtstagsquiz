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
| Tunnel/DNS         | Domainarbeit kann bestehende Deployments stoeren | erst lokal stabil testen; keine Cloudflare-/DNS-Aktion ohne `[CONFIRM]`         |

## Was bewusst klein bleibt

- In-Memory-State statt Persistenz
- ein vorbereiteter Abendablauf statt Modussammlung
- manuelles Vorbereiten des Quiz statt Editor-Ausbau
- ein praktischer lokaler oder einfacher Serverbetrieb statt Infra-Setup
- optionaler Cloudflare Tunnel nur als Verbindung zu lokalen Diensten
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
| Legacy Room Create | `room:create` existiert parallel zu `display:create-room` | Verwirrung in der Code-Wartung; es gibt zwei Wege einen Raum zu eröffnen. Der Display-Flow ist der primäre Pfad. |

## Bewusste Sicherheitsentscheidungen (MVP-Kontext)

| Thema                        | Verhalten                                                                                                                                                                                                                                      | Begründung                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| hostToken im Display-Browser | `DISPLAY_ROOM_CREATED` gibt den `hostToken` an den Display-Client zurueck. Der Token wird im Browser-State gehalten und in den QR-Code-URL eingebettet. Wer Zugriff auf den Display-Browser hat (DevTools, localStorage), kann den Token lesen. | Fuer einen Abend mit Vertrauenspersonen akzeptiert. Der QR-Code wird nur kurz sichtbar. Kein zusaetzlicher Schutz noetig fuer diesen Einsatzzweck. |
| Reconnect ohne Secret        | `connection:resume` authentifiziert nur per `sessionId` + `roomId`. Kein zusaetzliches Secret oder Bearer-Token. Wer eine fremde `sessionId` kennt, kann die Session uebernehmen.                                                              | SessionIds sind zufaellige UUIDs. In einem lokalen WLAN ohne externe Angreifer ist dieses Risiko minimal. Fuer einen isolierten Abend akzeptiert. |
| Cloudflare-Credentials       | Tunnel-Credentials und Tokens waeren bei Commit direkt missbrauchbar.                                                                                                                                                                           | Keine echten Secrets ins Repo. Nur Beispiele wie `deploy/cloudflare-tunnel.example.yml` versionieren.                                          |

## Praktische Empfehlungen vor dem Abend

- Hostgeraet ans Ladegeraet
- mindestens zwei echte Handys testen
- Join per QR und per Code einmal durchspielen
- eine komplette Fragerunde mit Antwort, Reveal und Rangliste testen
- Browser-Tabs waehrend des eigentlichen Abends moeglichst nicht neu laden
- keine letzten "coolen" Features kurz vorher einbauen

## Schluss

Die groesste Gefahr fuer dieses Repo ist nicht fehlende Enterprise-Haerte, sondern unnötige Komplexitaet kurz vor dem Einsatz.

Stabile Einfachheit ist hier die richtige Grenze.
