import { PROTOCOL_ERROR_CODES, type QuestionControllerPayload } from "@quiz/shared-protocol";
import { QuestionType, type CorrectAnswer } from "@quiz/shared-types";
import { getWebSocketProtocol } from "@quiz/shared-utils";

export function getViteEnv(name: string): string | undefined {
  return (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.[name];
}

export function getServerSocketUrl(): string {
  const envUrl = getViteEnv("VITE_SERVER_SOCKET_URL");
  if (envUrl) return envUrl;

  const url = new URL("/ws", window.location.href);
  url.protocol = getWebSocketProtocol(window.location.protocol);
  return url.toString();
}

export function getProtocolErrorMessage(code: string, fallback: string): string {
  switch (code) {
    case PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND:
      return "Raum nicht gefunden. Bitte Code prüfen.";
    case PROTOCOL_ERROR_CODES.ROOM_CLOSED:
      return "Der Raum nimmt keine Spieler mehr an.";
    case PROTOCOL_ERROR_CODES.SESSION_NOT_FOUND:
      return "Deine alte Sitzung ist abgelaufen. Bitte neu beitreten.";
    case PROTOCOL_ERROR_CODES.INVALID_PAYLOAD:
      return "Eingabe ungültig. Bitte prüfen und erneut versuchen.";
    case PROTOCOL_ERROR_CODES.INVALID_STATE:
      return "Diese Aktion passt gerade nicht zum Spielstand.";
    default:
      return fallback;
  }
}

export function getQuestionKindLabel(type: QuestionType): string {
  switch (type) {
    case QuestionType.Estimate:
      return "Schätzfrage";
    case QuestionType.MajorityGuess:
      return "Mehrheitsfrage";
    case QuestionType.Ranking:
      return "Reihenfolge";
    case QuestionType.Logic:
      return "Denkfrage";
    case QuestionType.OpenText:
      return "Textfrage";
    default:
      return "Frage";
  }
}

export function getOptionAnswerLabel(
  id: string,
  question?: QuestionControllerPayload | null,
): string {
  const entries =
    question && "options" in question
      ? question.options
      : question && "items" in question
        ? question.items
        : [];
  const entry = entries.find((option) => option.id === id);
  return entry?.text ? `${entry.label}: ${entry.text}` : (entry?.label ?? id);
}

export function formatControllerAnswer(
  answer: CorrectAnswer | null | undefined,
  question?: QuestionControllerPayload | null,
  unit?: string,
): string {
  if (!answer) return "-";
  if (answer.type === "option") return getOptionAnswerLabel(answer.value, question);
  if (answer.type === "number") return `${answer.value}${unit ? ` ${unit}` : ""}`;
  if (answer.type === "ranking") {
    return answer.value.map((id) => getOptionAnswerLabel(id, question)).join(" > ");
  }
  if (answer.type === "options") {
    return answer.value.map((id) => getOptionAnswerLabel(id, question)).join(" / ");
  }
  return answer.value;
}
