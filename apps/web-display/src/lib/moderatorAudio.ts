type ModeratorManifest = Record<string, string[]>;

const MIN_COOLDOWN_MS = 10_000;
const BLOCKED_AUDIO_MESSAGE = "Audio ist im Display blockiert. Bitte Audio aktivieren.";

let manifest: ModeratorManifest = {};
let manifestLoaded = false;
let manifestPromise: Promise<void> | null = null;
let currentAudio: HTMLAudioElement | null = null;
let lastPlayedAt = 0;
let currentPriority = Infinity;
let audioUnlocked = false;
let audioBlocked = false;
let lastError: string | null = null;

export async function loadManifest(): Promise<void> {
  if (manifestLoaded) return;
  if (manifestPromise) return manifestPromise;

  manifestPromise = loadManifestOnce();
  await manifestPromise;
}

async function loadManifestOnce(): Promise<void> {
  try {
    const response = await fetch("/audio/moderator/manifest.json");
    if (!response.ok) {
      console.warn("[moderator] manifest not found:", response.status);
      return;
    }
    const data: unknown = await response.json();
    if (data && typeof data === "object" && !Array.isArray(data)) {
      manifest = data as ModeratorManifest;
      manifestLoaded = true;
      lastError = null;
    }
  } catch (err) {
    lastError = "Moderator-Clips konnten nicht geladen werden.";
    console.warn("[moderator] failed to load manifest:", err);
  } finally {
    manifestPromise = null;
  }
}

export interface ModeratorAudioStatus {
  manifestLoaded: boolean;
  audioUnlocked: boolean;
  audioBlocked: boolean;
  errorMessage: string | null;
}

export interface ModeratorPlayResult {
  played: boolean;
  blocked: boolean;
  errorMessage: string | null;
}

export function getModeratorAudioStatus(): ModeratorAudioStatus {
  return {
    manifestLoaded,
    audioUnlocked,
    audioBlocked,
    errorMessage: lastError,
  };
}

export async function unlockModeratorAudio(): Promise<ModeratorAudioStatus> {
  try {
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextCtor) {
      const context = new AudioContextCtor();
      if (context.state !== "running") {
        await context.resume();
      }
      void context.close();
    }
    audioUnlocked = true;
    audioBlocked = false;
    lastError = null;
  } catch (err) {
    audioBlocked = true;
    lastError = BLOCKED_AUDIO_MESSAGE;
    console.warn("[moderator] failed to unlock audio:", err);
  }

  return getModeratorAudioStatus();
}

export async function playCategory(category: string, priority = 99, force = false): Promise<ModeratorPlayResult> {
  await loadManifest();

  const clips = manifest[category];
  if (!clips || clips.length === 0) {
    return { played: false, blocked: false, errorMessage: lastError };
  }

  const now = Date.now();
  const cooldownOk = force || now - lastPlayedAt >= MIN_COOLDOWN_MS;
  const priorityOk = force || priority <= currentPriority;

  if (!cooldownOk || !priorityOk) {
    return { played: false, blocked: false, errorMessage: lastError };
  }

  const url = clips[Math.floor(Math.random() * clips.length)];

  stopCurrent();

  const audio = new Audio(url);
  currentAudio = audio;
  currentPriority = priority;
  lastPlayedAt = now;

  audio.addEventListener("ended", () => {
    if (currentAudio === audio) {
      currentAudio = null;
      currentPriority = Infinity;
    }
  });

  try {
    await audio.play();
    audioUnlocked = true;
    audioBlocked = false;
    lastError = null;
    return { played: true, blocked: false, errorMessage: null };
  } catch (err) {
    audioBlocked = true;
    lastError = BLOCKED_AUDIO_MESSAGE;
    console.warn("[moderator] autoplay blocked or error:", err);
    if (currentAudio === audio) {
      currentAudio = null;
      currentPriority = Infinity;
    }
    return { played: false, blocked: true, errorMessage: lastError };
  }
}

export function stopCurrent(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
    currentPriority = Infinity;
  }
}

export function isPlaying(): boolean {
  return currentAudio !== null && !currentAudio.paused;
}

export function getCurrentPriority(): number {
  return currentPriority;
}
