export interface ModeratorAudioStatus {
  audioUnlocked: boolean;
  audioBlocked: boolean;
}

type AudioManifest = Partial<Record<string, string[]>>;

let currentAudio: HTMLAudioElement | null = null;
let currentPriority = 0;
let audioUnlocked = false;
let audioBlocked = false;
let manifest: AudioManifest = {};

export function getModeratorAudioStatus(): ModeratorAudioStatus {
  return { audioUnlocked, audioBlocked };
}

export async function loadManifest(): Promise<void> {
  try {
    const res = await fetch("/moderator-audio/manifest.json");
    if (res.ok) {
      manifest = (await res.json()) as AudioManifest;
    }
  } catch {
    // No manifest available — moderator audio clips silently disabled
  }
}

export async function playCategory(category: string, priority: number, force = false): Promise<void> {
  if (!audioUnlocked) return;
  if (!force && currentAudio && !currentAudio.paused && priority <= currentPriority) return;

  const clips = manifest[category];
  if (!clips || clips.length === 0) return;

  stopCurrent();
  const url = clips[Math.floor(Math.random() * clips.length)];
  const audio = new Audio(url);
  currentAudio = audio;
  currentPriority = priority;
  audio.onended = () => {
    if (currentAudio === audio) {
      currentAudio = null;
      currentPriority = 0;
    }
  };
  try {
    await audio.play();
  } catch {
    if (currentAudio === audio) {
      currentAudio = null;
      currentPriority = 0;
    }
    audioBlocked = true;
  }
}

export function stopCurrent(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
    currentPriority = 0;
  }
}

// Must be called from a user gesture (e.g. button click) to unlock autoplay.
export async function unlockModeratorAudio(): Promise<ModeratorAudioStatus> {
  try {
    const silence = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA");
    await silence.play();
    audioUnlocked = true;
    audioBlocked = false;
  } catch {
    audioBlocked = true;
    audioUnlocked = false;
  }
  return getModeratorAudioStatus();
}
