import type { RoomSettings } from "@quiz/shared-types";

export function createDefaultRoomSettings(): RoomSettings {
  return {
    showAnswerTextOnPlayerDevices: false,
    moderatorEnabled: false,
    moderatorFrequency: "low",
  };
}
