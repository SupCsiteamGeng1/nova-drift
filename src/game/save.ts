import { MAX_SCORES, SAVE_KEY, SAVE_VERSION } from "./constants";

export type HighScore = {
  name: string;
  score: number;
  wave: number;
  at: number;
};

export type SaveData = {
  version: number;
  scores: HighScore[];
  muted: boolean;
  shake: boolean;
};

const defaults: SaveData = {
  version: SAVE_VERSION,
  scores: [],
  muted: false,
  shake: true,
};

function migrate(raw: SaveData): SaveData {
  const next = { ...defaults, ...raw, scores: Array.isArray(raw.scores) ? raw.scores : [] };
  next.version = SAVE_VERSION;
  next.scores = next.scores
    .filter((s) => s && typeof s.score === "number")
    .map((s) => ({
      name: String(s.name || "นักบิน").slice(0, 12),
      score: Math.max(0, Math.floor(s.score)),
      wave: Math.max(1, Math.floor(s.wave || 1)),
      at: typeof s.at === "number" ? s.at : Date.now(),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SCORES);
  next.muted = Boolean(raw.muted);
  next.shake = raw.shake !== false;
  return next;
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...defaults, scores: [] };
    const parsed = JSON.parse(raw) as SaveData;
    return migrate(parsed);
  } catch {
    return { ...defaults, scores: [] };
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch {
    /* private mode / quota */
  }
}

export function qualifies(scores: HighScore[], score: number) {
  if (score <= 0) return false;
  if (scores.length < MAX_SCORES) return true;
  return score > (scores[scores.length - 1]?.score ?? 0);
}

export function insertScore(data: SaveData, entry: HighScore): SaveData {
  const scores = [...data.scores, entry].sort((a, b) => b.score - a.score).slice(0, MAX_SCORES);
  const next = { ...data, scores };
  writeSave(next);
  return next;
}

export function patchSettings(data: SaveData, patch: Partial<Pick<SaveData, "muted" | "shake">>) {
  const next = { ...data, ...patch };
  writeSave(next);
  return next;
}
