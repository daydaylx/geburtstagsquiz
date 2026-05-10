import type { EventName } from "@quiz/shared-protocol";
import { EVENTS } from "@quiz/shared-protocol";
import type { ClientRole } from "@quiz/shared-types";

export function isEventAllowedForRole(event: EventName, role: ClientRole | null): boolean {
  const hostOnlyEvents: EventName[] = [
    EVENTS.GAME_START,
    EVENTS.GAME_NEXT_QUESTION,
    EVENTS.QUESTION_FORCE_CLOSE,
    EVENTS.GAME_SHOW_SCOREBOARD,
    EVENTS.GAME_FINISH_NOW,
    EVENTS.PLAYER_REMOVE,
    EVENTS.ROOM_SETTINGS_UPDATE,
    EVENTS.ROOM_CLOSE,
  ];
  const playerOnlyEvents: EventName[] = [
    EVENTS.ANSWER_SUBMIT,
    EVENTS.NEXT_QUESTION_READY,
    EVENTS.CATEGORY_VOTE,
  ];
  const displayOnlyEvents: EventName[] = [EVENTS.DISPLAY_CREATE_ROOM, EVENTS.DISPLAY_CONNECT_ROOM];

  if (role === "display") {
    return ![...hostOnlyEvents, ...playerOnlyEvents, EVENTS.HOST_CREATE_ROOM].includes(event);
  }
  if (role === "host") {
    return ![...playerOnlyEvents, ...displayOnlyEvents].includes(event);
  }
  if (role === "player") {
    return ![
      ...hostOnlyEvents,
      ...displayOnlyEvents,
      EVENTS.HOST_CONNECT,
      EVENTS.HOST_CREATE_ROOM,
    ].includes(event);
  }
  return true;
}
