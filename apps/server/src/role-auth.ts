import type { EventName } from "@quiz/shared-protocol";
import { EVENTS } from "@quiz/shared-protocol";
import type { ClientRole } from "@quiz/shared-types";

const UNAUTHENTICATED_ALLOWED_EVENTS: ReadonlySet<EventName> = new Set<EventName>([
  EVENTS.HOST_CREATE_ROOM,
  EVENTS.HOST_CONNECT,
  EVENTS.DISPLAY_CREATE_ROOM,
  EVENTS.DISPLAY_CONNECT_ROOM,
  EVENTS.ROOM_JOIN,
  EVENTS.CONNECTION_RESUME,
]);

const HOST_ONLY_EVENTS: ReadonlySet<EventName> = new Set<EventName>([
  EVENTS.GAME_START,
  EVENTS.GAME_NEXT_QUESTION,
  EVENTS.QUESTION_FORCE_CLOSE,
  EVENTS.GAME_SHOW_SCOREBOARD,
  EVENTS.GAME_FINISH_NOW,
  EVENTS.GAME_RESTART,
  EVENTS.PLAYER_REMOVE,
  EVENTS.ROOM_SETTINGS_UPDATE,
  EVENTS.ROOM_CLOSE,
  EVENTS.MODERATOR_CONTROL,
]);

const PLAYER_ONLY_EVENTS: ReadonlySet<EventName> = new Set<EventName>([
  EVENTS.ANSWER_SUBMIT,
  EVENTS.NEXT_QUESTION_READY,
  EVENTS.CATEGORY_VOTE,
]);

const DISPLAY_ONLY_EVENTS: ReadonlySet<EventName> = new Set<EventName>([
  EVENTS.DISPLAY_CREATE_ROOM,
  EVENTS.DISPLAY_CONNECT_ROOM,
]);

export function isEventAllowedForRole(event: EventName, role: ClientRole | null): boolean {
  if (role === "display") {
    return !HOST_ONLY_EVENTS.has(event) && !PLAYER_ONLY_EVENTS.has(event) && event !== EVENTS.HOST_CREATE_ROOM;
  }
  if (role === "host") {
    return !PLAYER_ONLY_EVENTS.has(event) && !DISPLAY_ONLY_EVENTS.has(event);
  }
  if (role === "player") {
    return (
      !HOST_ONLY_EVENTS.has(event) &&
      !DISPLAY_ONLY_EVENTS.has(event) &&
      event !== EVENTS.HOST_CONNECT &&
      event !== EVENTS.HOST_CREATE_ROOM
    );
  }
  return UNAUTHENTICATED_ALLOWED_EVENTS.has(event);
}
