# 07 - Workflow-Regeln

## Grundworkflow

Jede Phase folgt diesem Ablauf:

1. Analyse.
2. Plan.
3. Go durch Nutzer.
4. Kleine Umsetzung.
5. Tests.
6. Review.
7. Naechster Schritt.

Keine Phase soll "mal eben" mehrere grosse Baustellen zusammenziehen.

## Arbeitsregeln

- Vor jeder Codeaenderung relevante Dateien lesen.
- Vor Umsetzung kurz benennen, welche Dateien betroffen sind.
- Keine bestehenden uncommitted Aenderungen anderer Arbeit zuruecksetzen.
- Keine Codeaenderung ausserhalb der geplanten Phase.
- Keine neuen Dependencies ohne ausdruecklichen Go.
- Keine Refactors, die nicht fuer die Phase notwendig sind.
- Keine Doku-Code-Divergenz akzeptieren.

## Pflichtkommandos nach Codeaenderungen

Immer:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Zusaetzlich je nach Phase:

```bash
pnpm --filter @quiz/server run typecheck
pnpm --filter @quiz/web-host run typecheck
pnpm --filter @quiz/web-player run typecheck
pnpm --filter @quiz/web-display run typecheck
```

Nur ausfuehren, wenn das jeweilige Package existiert.

## Branch- und Commit-Empfehlung

Empfohlene Branches:

```text
umbau/01-server-display-role
umbau/02-display-app
umbau/03-host-controller
umbau/04-player-polish
umbau/05-question-mix
umbau/06-domain-cloudflare
```

Commits klein halten:

- Ein Commit fuer Protokolltypen.
- Ein Commit fuer Serverrollen.
- Ein Commit fuer Display-App-Minimum.
- Ein Commit fuer Host-Controller-Umbau.
- Ein Commit fuer Player-Wording/kleine Anpassungen.
- Ein Commit fuer Domain-Env/Skripte.

## Agentenregeln

Jeder Folgeprompt soll enthalten:

- Erst analysieren.
- Plan zeigen.
- Auf Go warten.
- Danach nur die freigegebene Phase umsetzen.
- Keine App-/Server-/Package-Dateien ausserhalb der Phase anfassen.
- Nach Codeaenderungen Pflichtkommandos ausfuehren.

## Testregeln

- Protokollaenderungen brauchen Schema-Tests.
- Serverrollen brauchen Autorisierungstests.
- Reconnect-Aenderungen brauchen mindestens servernahe Tests und manuellen Testplan.
- UI-Aenderungen brauchen mindestens Build/Typecheck und manuelle Abnahme.
- Fragenlogik braucht deterministische Unit-Tests.

## Abnahmeregeln

Eine Phase gilt erst als fertig, wenn:

- Die geplanten Dateien angepasst wurden.
- Tests passend zur Aenderung ergaenzt wurden.
- `pnpm typecheck`, `pnpm test`, `pnpm build` gruen sind.
- Manuelle Abnahmeschritte dokumentiert oder ausgefuehrt sind.
- Keine neue Rolle mehr Rechte bekommt als noetig.

## Was nicht gleichzeitig gemacht werden darf

- Serverrollen und Cloudflare.
- Display-App und Host-Komplettumbau.
- Fragenkatalog-Umbau und Protokollumbau.
- Durable Objects und Node-Server-Rollen.
- Animationen und Architektur.
- Neue Spielmodi und UI-Trennung.
- Startskript-Hotspot-Refactor und Domain-Setup.

## Freeze-Regel vor dem Abend

Wenn ein stabiler lokaler Durchlauf mit echten Geraeten geschafft ist, wird Scope eingefroren. Danach nur noch Bugfixes, keine neuen Features.

