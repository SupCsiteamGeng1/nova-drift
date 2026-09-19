import { create } from "zustand";
import { loadSave, type HighScore } from "./save";
import type { BoardRow } from "@/lib/board";

export type Screen = "title" | "opening" | "playing" | "paused" | "gameover" | "scores" | "board";

export type Hud = {
  score: number;
  lives: number;
  wave: number;
  shield: number;
  multi: number;
  speedLeft: number;
  banner: string;
  weapon: string;
  weaponLevel: number;
  bossHp: number;
  bossMax: number;
  bossName: string;
  bombs: number;
};

const save = loadSave();

type GameStore = {
  screen: Screen;
  loaded: boolean;
  hud: Hud;
  muted: boolean;
  shake: boolean;
  lastScore: number;
  lastWave: number;
  qualifies: boolean;
  scores: HighScore[];
  board: BoardRow[];
  boardStatus: "idle" | "loading" | "error";
  setScreen: (screen: Screen) => void;
  setLoaded: (loaded: boolean) => void;
  setHud: (hud: Partial<Hud>) => void;
  setMuted: (muted: boolean) => void;
  setShake: (shake: boolean) => void;
  setScores: (scores: HighScore[]) => void;
  setBoard: (board: BoardRow[]) => void;
  setBoardStatus: (boardStatus: "idle" | "loading" | "error") => void;
  setGameOver: (score: number, wave: number, qualifies: boolean) => void;
};

export const useGameStore = create<GameStore>((set) => ({
  screen: "title",
  loaded: false,
  hud: {
    score: 0,
    lives: 3,
    wave: 1,
    shield: 0,
    multi: 1,
    speedLeft: 0,
    banner: "",
    weapon: "พัลส์",
    weaponLevel: 1,
    bossHp: 0,
    bossMax: 0,
    bossName: "",
    bombs: 2,
  },
  muted: save.muted,
  shake: save.shake,
  lastScore: 0,
  lastWave: 1,
  qualifies: false,
  scores: save.scores,
  board: [],
  boardStatus: "idle",
  setScreen: (screen) => set({ screen }),
  setLoaded: (loaded) => set({ loaded }),
  setHud: (hud) => set((s) => ({ hud: { ...s.hud, ...hud } })),
  setMuted: (muted) => set({ muted }),
  setShake: (shake) => set({ shake }),
  setScores: (scores) => set({ scores }),
  setBoard: (board) => set({ board, boardStatus: "idle" }),
  setBoardStatus: (boardStatus) => set({ boardStatus }),
  setGameOver: (lastScore, lastWave, qualifies) =>
    set({ screen: "gameover", lastScore, lastWave, qualifies }),
}));

export type GameHandle = {
  start: () => void;
  resume: () => void;
  pause: () => void;
  restart: () => void;
  toTitle: () => void;
  toScores: () => void;
  toBoard: () => void;
  submitName: (name: string) => void;
  toggleMute: () => void;
  toggleShake: () => void;
  unlockAudio: () => void;
  cycleWeapon: () => void;
  skipOpening: () => void;
  fireBomb: () => void;
};
