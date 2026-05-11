import type { RoomRecord } from "./server-types.js";

export function clearActiveRoomTimers(room: RoomRecord): void {
  if (room.countdownTimer) {
    clearTimeout(room.countdownTimer);
    room.countdownTimer = null;
    room.countdownStartedAt = null;
  }

  if (room.questionTimer) {
    clearTimeout(room.questionTimer);
    room.questionTimer = null;
  }

  if (room.timerTickInterval) {
    clearInterval(room.timerTickInterval);
    room.timerTickInterval = null;
  }

  if (room.revealTimer) {
    clearTimeout(room.revealTimer);
    room.revealTimer = null;
  }

  if (room.completedRoomTtlTimer) {
    clearTimeout(room.completedRoomTtlTimer);
    room.completedRoomTtlTimer = null;
  }
}
