import { QuestionType, type Quiz } from "@quiz/shared-types";

// Dies ist bewusst die eine Datei fuer den Abend.
// Vor dem Einsatz Namen und Antworten einmal auf das echte Geburtstagskind anpassen.
const BIRTHDAY_CONFIG = {
  celebrantName: "Alex",
  newAge: 30,
  favoriteColor: "Petrol",
  favoriteDrink: "Spezi",
  favoriteLateNightSnack: "Pizza",
  favoriteWeekendPlan: "Escape Room",
  dreamTrip: "Japan",
  mustHaveCakeFlavor: "Zitrone",
} as const;

const BIRTHDAY_QUIZ: Quiz = {
  id: "birthday-quiz-001",
  title: `${BIRTHDAY_CONFIG.celebrantName}s Geburtstagsquiz`,
  questions: [
    {
      id: "q1",
      type: QuestionType.MultipleChoice,
      text: `Wie alt wird ${BIRTHDAY_CONFIG.celebrantName} auf dieser Feier?`,
      options: [
        { id: "A", label: String(BIRTHDAY_CONFIG.newAge - 2) },
        { id: "B", label: String(BIRTHDAY_CONFIG.newAge - 1) },
        { id: "C", label: String(BIRTHDAY_CONFIG.newAge) },
        { id: "D", label: String(BIRTHDAY_CONFIG.newAge + 1) },
      ],
      correctOptionId: "C",
      durationMs: 15_000,
      points: 10,
    },
    {
      id: "q2",
      type: QuestionType.MultipleChoice,
      text: `Welche Farbe passt am besten zu ${BIRTHDAY_CONFIG.celebrantName}?`,
      options: [
        { id: "A", label: "Koralle" },
        { id: "B", label: BIRTHDAY_CONFIG.favoriteColor },
        { id: "C", label: "Silber" },
        { id: "D", label: "Neongelb" },
      ],
      correctOptionId: "B",
      durationMs: 15_000,
      points: 10,
    },
    {
      id: "q3",
      type: QuestionType.MultipleChoice,
      text: `Welches Getraenk bestellt ${BIRTHDAY_CONFIG.celebrantName} wahrscheinlich zuerst?`,
      options: [
        { id: "A", label: "Tomatensaft" },
        { id: "B", label: "Wasser ohne Kohlensaeure" },
        { id: "C", label: BIRTHDAY_CONFIG.favoriteDrink },
        { id: "D", label: "Gruener Tee" },
      ],
      correctOptionId: "C",
      durationMs: 15_000,
      points: 10,
    },
    {
      id: "q4",
      type: QuestionType.MultipleChoice,
      text: `Was darf bei ${BIRTHDAY_CONFIG.celebrantName}s Spaetprogramm nicht fehlen?`,
      options: [
        { id: "A", label: "Selleriesticks" },
        { id: "B", label: BIRTHDAY_CONFIG.favoriteLateNightSnack },
        { id: "C", label: "Muesli" },
        { id: "D", label: "Reiswaffeln" },
      ],
      correctOptionId: "B",
      durationMs: 15_000,
      points: 10,
    },
    {
      id: "q5",
      type: QuestionType.MultipleChoice,
      text: `Welcher Wochenendplan trifft ${BIRTHDAY_CONFIG.celebrantName} am ehesten?`,
      options: [
        { id: "A", label: "Frueh um 7 joggen" },
        { id: "B", label: "Den Keller sortieren" },
        { id: "C", label: BIRTHDAY_CONFIG.favoriteWeekendPlan },
        { id: "D", label: "Drei Stunden Steuererklaerung" },
      ],
      correctOptionId: "C",
      durationMs: 15_000,
      points: 10,
    },
    {
      id: "q6",
      type: QuestionType.MultipleChoice,
      text: `Welche Reise waere fuer ${BIRTHDAY_CONFIG.celebrantName} ein Volltreffer?`,
      options: [
        { id: "A", label: "Bielefeld" },
        { id: "B", label: BIRTHDAY_CONFIG.dreamTrip },
        { id: "C", label: "Parkplatzbesichtigung West" },
        { id: "D", label: "Drei Tage Flughafen ohne Abflug" },
      ],
      correctOptionId: "B",
      durationMs: 15_000,
      points: 10,
    },
    {
      id: "q7",
      type: QuestionType.MultipleChoice,
      text: `Welche Kuchensorte sollte auf dieser Feier besser nicht fehlen?`,
      options: [
        { id: "A", label: "Marmorkuchen" },
        { id: "B", label: "Schokoladenkuchen" },
        { id: "C", label: BIRTHDAY_CONFIG.mustHaveCakeFlavor },
        { id: "D", label: "Trockener Zwieback" },
      ],
      correctOptionId: "C",
      durationMs: 15_000,
      points: 10,
    },
  ],
};

export function getDefaultQuiz(): Quiz {
  return BIRTHDAY_QUIZ;
}
