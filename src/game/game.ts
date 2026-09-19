import {
  BULLET_SPEED,
  ENEMY_BULLET_SPEED,
  FIXED_DT,
  INVULN_TIME,
  MAX_FRAME_DT,
  MAX_LIVES,
  MULTI_DURATION,
  PLAYER_ACCEL,
  PLAYER_BOOST_SPEED,
  PLAYER_RADIUS,
  PLAYER_SIZE,
  PLAYER_SPEED,
  POINTER_FOLLOW,
  SPEED_DURATION,
  START_LIVES,
  START_BOMBS,
  MAX_BOMBS,
  BOMB_COOLDOWN,
  BOMB_RADIUS,
} from "./constants";
import { loadSprites, sheetFrame, type Sprites } from "./assets";
import { GameAudio } from "./audio";
import { Input } from "./input";
import { insertScore, loadSave, patchSettings, qualifies, writeSave, type SaveData } from "./save";
import { useGameStore, type GameHandle } from "./store";
import { cleanTag, listBoard, submitBoard } from "@/lib/board";

type Kind = "scout" | "fighter" | "bomber" | "sniper" | "hunter" | "drone" | "mini" | "boss";
type Pattern = "sine" | "dive" | "hold" | "strafe" | "seek" | "orbit" | "snipe" | "miniboss" | "boss";
type PowerKind = "multi" | "shield" | "speed" | "life";
type WeaponKind = "pulse" | "spread" | "pierce" | "missile";
type PickupKind = PowerKind | WeaponKind | "bomb";
type ShotStyle = WeaponKind | "enemy";

type Enemy = {
  alive: boolean;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  max: number;
  r: number;
  fire: number;
  phase: number;
  pattern: Pattern;
  originX: number;
  flash: number;
  score: number;
  dir: number;
};

type Bullet = {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  player: boolean;
  frame: number;
  dmg: number;
  pierce: number;
  homing: number;
  splash: number;
  style: ShotStyle;
  hits: Enemy[];
};

type Pickup = { alive: boolean; x: number; y: number; kind: PickupKind; bob: number };
type Particle = {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
};
type Anim = { alive: boolean; x: number; y: number; t: number; size: number };
type Floater = { alive: boolean; x: number; y: number; text: string; t: number };
type Star = { x: number; y: number; z: number; s: number; a: number };

const POWER_INDEX: Record<PowerKind, number> = { multi: 0, shield: 1, speed: 2, life: 3 };
const WEAPON_INDEX: Record<WeaponKind, number> = { pulse: 0, spread: 1, pierce: 2, missile: 3 };
const WEAPON_ORDER: WeaponKind[] = ["pulse", "spread", "pierce", "missile"];
const WEAPON_NAME: Record<WeaponKind, string> = {
  pulse: "พัลส์",
  spread: "สเปรด",
  pierce: "เจาะเกราะ",
  missile: "มิสไซล์",
};

function isWeapon(kind: PickupKind): kind is WeaponKind {
  return kind === "pulse" || kind === "spread" || kind === "pierce" || kind === "missile";
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function expLerp(current: number, target: number, k: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-k * dt));
}

function easeOutCubic(t: number) {
  const x = clamp(t, 0, 1);
  return 1 - (1 - x) ** 3;
}

const OPEN_LEN = 4.2;

function pool<T>(n: number, make: () => T): T[] {
  return Array.from({ length: n }, make);
}

function grab<T extends { alive: boolean }>(items: T[]): T | null {
  for (const it of items) if (!it.alive) return it;
  return null;
}

export function createGame(canvas: HTMLCanvasElement): GameHandle & { destroy: () => void } {
  const maybeCtx = canvas.getContext("2d");
  if (!maybeCtx) throw new Error("Canvas 2D unavailable");
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const input = new Input(canvas);
  const audio = new GameAudio();
  let sprites: Sprites | null = null;
  let save: SaveData = loadSave();
  audio.setMuted(save.muted);

  let w = 480;
  let h = 720;
  let dpr = 1;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let running = true;
  let phase: "title" | "opening" | "playing" | "paused" | "gameover" = "title";
  let banner = "";
  let bannerT = 0;
  let openingT = 0;
  let bootT = 0;
  let starWarp = 3.2;

  const player = {
    x: 240,
    y: 800,
    vx: 0,
    vy: 0,
    r: PLAYER_RADIUS,
    lives: START_LIVES,
    invuln: 0,
    fire: 0,
    multi: 1,
    multiT: 0,
    shield: 0,
    speedT: 0,
    deadT: 0,
    bank: 0,
    weapon: "pulse" as WeaponKind,
    levels: { pulse: 1, spread: 0, pierce: 0, missile: 0 } as Record<WeaponKind, number>,
    bombs: START_BOMBS,
    bombCd: 0,
  };

  let score = 0;
  let wave = 1;
  let trauma = 0;
  let hitstop = 0;
  let spawn: { t: number; kind: Kind; x: number; pattern: Pattern; dir?: number }[] = [];
  let spawnClock = 0;
  let clearDelay = 0;
  let time = 0;
  let hudClock = 0;
  let yawMem = 0;
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const bullets = pool(220, () => ({
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 4,
    life: 0,
    player: true,
    frame: 0,
    dmg: 1,
    pierce: 0,
    homing: 0,
    splash: 0,
    style: "pulse" as ShotStyle,
    hits: [] as Enemy[],
  })) as Bullet[];
  const ebullets = pool(400, () => ({
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    r: 5,
    life: 0,
    player: false,
    frame: 0,
    dmg: 1,
    pierce: 0,
    homing: 0,
    splash: 0,
    style: "enemy" as ShotStyle,
    hits: [] as Enemy[],
  })) as Bullet[];
  const enemies = pool(80, () => ({
    alive: false,
    kind: "scout" as Kind,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    hp: 1,
    max: 1,
    r: 14,
    fire: 0,
    phase: 0,
    pattern: "sine" as Pattern,
    originX: 0,
    flash: 0,
    score: 100,
    dir: 1,
  })) as Enemy[];
  const pickups = pool(14, () => ({ alive: false, x: 0, y: 0, kind: "multi" as PickupKind, bob: 0 }));
  const particles = pool(260, () => ({
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    max: 1,
    size: 2,
    color: "#7ec8e3",
  })) as Particle[];
  const muzzle = pool(10, () => ({ alive: false, x: 0, y: 0, t: 0, size: 28 })) as Anim[];
  const booms = pool(18, () => ({ alive: false, x: 0, y: 0, t: 0, size: 48 })) as Anim[];
  const blasts = pool(6, () => ({ alive: false, x: 0, y: 0, t: 0, size: 48 })) as Anim[];
  const floaters = pool(20, () => ({ alive: false, x: 0, y: 0, text: "", t: 0 })) as Floater[];
  const stars: Star[] = [];

  function seedStars() {
    stars.length = 0;
    for (let i = 0; i < 140; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        z: i < 70 ? 0 : i < 115 ? 1 : 2,
        s: i < 70 ? 0.8 : i < 115 ? 1.4 : 2.2,
        a: 0.25 + Math.random() * 0.55,
      });
    }
  }

  function resize() {
    const parent = canvas.parentElement;
    const cw = parent?.clientWidth || window.innerWidth;
    const ch = parent?.clientHeight || window.innerHeight;
    w = Math.max(320, cw);
    h = Math.max(480, ch);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    if (phase === "playing" || phase === "paused") {
      player.x = clamp(player.x, 28, w - 28);
      player.y = clamp(player.y, 40, h - 28);
    }
    if (stars.length === 0) seedStars();
  }

  function addTrauma(v: number) {
    if (!save.shake || reduced) return;
    trauma = clamp(trauma + v, 0, 1);
  }

  function burst(x: number, y: number, n: number, color: string, speed: number) {
    for (let i = 0; i < n; i++) {
      const p = grab(particles);
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random());
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.max = p.life = 0.35 + Math.random() * 0.45;
      p.size = 1.2 + Math.random() * 2.4;
      p.color = color;
    }
  }

  function boom(x: number, y: number, size: number) {
    const b = grab(booms);
    if (b) {
      b.alive = true;
      b.x = x;
      b.y = y;
      b.t = 0;
      b.size = size;
    }
    burst(x, y, 14, "#f2d3b0", 180);
    burst(x, y, 8, "#7ec8e3", 120);
  }

  function floatText(x: number, y: number, text: string) {
    const f = grab(floaters);
    if (!f) return;
    f.alive = true;
    f.x = x;
    f.y = y;
    f.text = text;
    f.t = 0.8;
  }

  function spawnShot(
    poolArr: Bullet[],
    x: number,
    y: number,
    angle: number,
    speed: number,
    opts: Partial<Bullet> & { player: boolean },
  ) {
    const b = grab(poolArr);
    if (!b) return;
    b.alive = true;
    b.x = x;
    b.y = y;
    b.vx = Math.sin(angle) * speed;
    b.vy = -Math.cos(angle) * speed;
    b.r = opts.r ?? 4;
    b.life = opts.life ?? 1.2;
    b.player = opts.player;
    b.frame = 0;
    b.dmg = opts.dmg ?? 1;
    b.pierce = opts.pierce ?? 0;
    b.homing = opts.homing ?? 0;
    b.splash = opts.splash ?? 0;
    b.style = opts.style ?? (opts.player ? "pulse" : "enemy");
    b.hits = [];
  }

  function barrels() {
    if (player.multi >= 5) return [-16, -8, 0, 8, 16];
    if (player.multi >= 3) return [-10, 0, 10];
    return [0];
  }

  function firePlayer() {
    const lv = Math.max(1, player.levels[player.weapon]);
    const oxs = barrels();
    const muzzleSize = 28 + lv * 3 + (player.multi > 1 ? 4 : 0);

    if (player.weapon === "pulse") {
      const angs = lv >= 4 ? [-0.2, 0, 0.2] : lv >= 3 ? [-0.12, 0.12] : [0];
      const dmg = lv >= 2 ? 2 : 1;
      for (const bx of oxs) {
        for (const a of angs) {
          spawnShot(bullets, player.x + bx, player.y - 22, a, BULLET_SPEED, {
            player: true,
            r: 4 + (lv >= 4 ? 1 : 0),
            life: 1.15,
            dmg,
            style: "pulse",
          });
        }
      }
      audio.shoot();
    } else if (player.weapon === "spread") {
      const count = lv >= 4 ? 7 : lv >= 2 ? 5 : 3;
      const spread = 0.18 + lv * 0.05;
      const dmg = lv >= 3 ? 2 : 1;
      for (const bx of oxs) {
        for (let i = 0; i < count; i++) {
          const t = i / Math.max(1, count - 1);
          const a = -spread + t * spread * 2;
          spawnShot(bullets, player.x + bx, player.y - 18, a, 520 + lv * 20, {
            player: true,
            r: 3.2,
            life: 0.7,
            dmg,
            style: "spread",
          });
        }
      }
      audio.shootSpread();
    } else if (player.weapon === "pierce") {
      const angs = lv >= 4 ? [-0.16, 0, 0.16] : lv >= 3 ? [-0.1, 0.1] : [0];
      for (const bx of oxs) {
        for (const a of angs) {
          spawnShot(bullets, player.x + bx, player.y - 24, a, 640, {
            player: true,
            r: 5,
            life: 1.35,
            dmg: 2 + (lv >= 2 ? 1 : 0),
            pierce: 1 + lv,
            style: "pierce",
          });
        }
      }
      audio.shootPierce();
    } else {
      const count = lv >= 4 ? 3 : lv >= 3 ? 2 : 1;
      const homing = 4 + lv * 1.4;
      for (const bx of oxs) {
        for (let i = 0; i < count; i++) {
          const a = (i - (count - 1) / 2) * 0.18;
          spawnShot(bullets, player.x + bx + a * 12, player.y - 18, a, 340 + lv * 30, {
            player: true,
            r: 6,
            life: 2.2,
            dmg: 3 + lv,
            homing,
            splash: lv >= 3 ? 42 : 0,
            style: "missile",
          });
        }
      }
      audio.shootMissile();
    }

    const m = grab(muzzle);
    if (m) {
      m.alive = true;
      m.x = player.x;
      m.y = player.y - 26;
      m.t = 0;
      m.size = muzzleSize;
    }
    addTrauma(player.weapon === "missile" ? 0.07 : 0.04);
  }

  function fireCooldown() {
    const lv = Math.max(1, player.levels[player.weapon]);
    const speedMul = player.speedT > 0 ? 0.85 : 1;
    if (player.weapon === "pulse") return (lv >= 4 ? 0.09 : lv >= 2 ? 0.1 : 0.12) * speedMul;
    if (player.weapon === "spread") return (lv >= 4 ? 0.18 : 0.22) * speedMul;
    if (player.weapon === "pierce") return (lv >= 3 ? 0.15 : 0.18) * speedMul;
    return (lv >= 4 ? 0.3 : 0.38) * speedMul;
  }

  function fireEnemy(e: Enemy) {
    if (e.kind === "mini") {
      const mode = Math.floor(e.phase * 0.7) % 2;
      if (mode === 0) {
        for (const off of [-0.48, -0.24, 0, 0.24, 0.48]) {
          spawnShot(ebullets, e.x, e.y + e.r * 0.3, Math.PI + off, ENEMY_BULLET_SPEED + 20, {
            player: false,
            r: 5.5,
            life: 3.2,
            style: "enemy",
          });
        }
      } else {
        const base = Math.atan2(player.x - e.x, -(player.y - e.y));
        for (const off of [-0.14, 0, 0.14]) {
          spawnShot(ebullets, e.x, e.y + 8, base + off, ENEMY_BULLET_SPEED + 40, {
            player: false,
            r: 5,
            life: 3,
            style: "enemy",
          });
        }
      }
      return;
    }
    if (e.kind === "boss") {
      const rage = e.hp / e.max < 0.4;
      const mode = Math.floor(e.phase * 0.45) % (rage ? 4 : 3);
      if (mode === 0) {
        const n = rage ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const a = e.phase * 1.7 + (i * Math.PI * 2) / n;
          spawnShot(ebullets, e.x, e.y, a, 155, { player: false, r: 6, life: 4.2, style: "enemy" });
        }
      } else if (mode === 1) {
        const n = rage ? 14 : 10;
        for (let i = 0; i < n; i++) {
          spawnShot(ebullets, e.x, e.y, (i / n) * Math.PI * 2, 170, {
            player: false,
            r: 5.5,
            life: 3.6,
            style: "enemy",
          });
        }
      } else if (mode === 2) {
        const base = Math.atan2(player.x - e.x, -(player.y - e.y));
        for (const off of [-0.28, -0.14, 0, 0.14, 0.28]) {
          spawnShot(ebullets, e.x, e.y + 12, base + off, ENEMY_BULLET_SPEED + 30, {
            player: false,
            r: 6,
            life: 3.2,
            style: "enemy",
          });
        }
      } else {
        spawnEnemy("hunter", e.x - 50, "seek");
        spawnEnemy("hunter", e.x + 50, "seek");
        spawnEnemy("drone", e.x, "orbit");
      }
      return;
    }
    if (e.kind === "sniper") {
      const base = Math.atan2(player.x - e.x, -(player.y - e.y));
      spawnShot(ebullets, e.x, e.y + 10, base, ENEMY_BULLET_SPEED + 110, {
        player: false,
        r: 6,
        life: 2.8,
        style: "enemy",
      });
      return;
    }
    if (e.kind === "hunter") {
      const base = Math.atan2(player.x - e.x, -(player.y - e.y));
      spawnShot(ebullets, e.x, e.y + 8, base, ENEMY_BULLET_SPEED + 50, {
        player: false,
        r: 5,
        life: 2.6,
        style: "enemy",
      });
      return;
    }
    if (e.kind === "drone") {
      for (const off of [-0.5, 0.5]) {
        spawnShot(ebullets, e.x, e.y + 6, Math.PI + off, ENEMY_BULLET_SPEED - 20, {
          player: false,
          r: 4,
          life: 2.4,
          style: "enemy",
        });
      }
      return;
    }
    const aimed = e.kind !== "scout";
    const shots = e.kind === "bomber" ? [-0.28, 0, 0.28] : [0];
    const base = aimed ? Math.atan2(player.x - e.x, -(player.y - e.y)) : Math.PI;
    for (const off of shots) {
      spawnShot(ebullets, e.x, e.y + e.r * 0.4, base + off, ENEMY_BULLET_SPEED, {
        player: false,
        r: e.kind === "bomber" ? 6 : 4.5,
        life: 3,
        style: "enemy",
      });
    }
  }

  function stats(kind: Kind) {
    if (kind === "scout")
      return { hp: 1, r: 13, size: 34, score: 120, speed: 95 + wave * 6 };
    if (kind === "fighter")
      return { hp: 3 + Math.floor(wave / 4), r: 17, size: 44, score: 280, speed: 72 + wave * 5 };
    if (kind === "sniper")
      return { hp: 4 + Math.floor(wave / 3), r: 16, size: 42, score: 360, speed: 48 };
    if (kind === "hunter")
      return { hp: 2 + Math.floor(wave / 5), r: 14, size: 36, score: 220, speed: 110 + wave * 4 };
    if (kind === "drone")
      return { hp: 2, r: 11, size: 28, score: 160, speed: 70 + wave * 3 };
    if (kind === "mini")
      return { hp: 56 + wave * 12, r: 36, size: 92, score: 2400 + wave * 80, speed: 42 };
    if (kind === "boss")
      return { hp: 140 + wave * 18, r: 52, size: 128, score: 8000 + wave * 220, speed: 30 };
    return { hp: 10 + wave, r: 24, size: 58, score: 700, speed: 46 + wave * 3 };
  }

  function spawnEnemy(kind: Kind, x: number, pattern: Pattern, dir = 1) {
    const e = grab(enemies);
    if (!e) return;
    const st = stats(kind);
    e.alive = true;
    e.kind = kind;
    e.x = clamp(x, 36, w - 36);
    e.y = kind === "boss" || kind === "mini" ? -st.size : -28;
    e.vx = 0;
    e.vy = st.speed;
    e.hp = st.hp;
    e.max = st.hp;
    e.r = st.r;
    e.fire = kind === "boss" ? 0.8 : kind === "mini" ? 0.55 : kind === "sniper" ? 0.9 : 0.4 + Math.random() * 0.8;
    e.phase = Math.random() * Math.PI * 2;
    e.pattern = pattern;
    e.originX = e.x;
    e.flash = 0;
    e.score = st.score;
    e.dir = dir;
  }

  function planWave(n: number) {
    spawn = [];
    spawnClock = 0;
    clearDelay = 0;
    let t = 0.28;
    const pack = (kind: Kind, count: number, pattern: Pattern, gap = 0.16, dir = 1) => {
      const spread = Math.min(w - 72, 70 + count * 32);
      const left = (w - spread) / 2;
      for (let i = 0; i < count; i++) {
        const x = count === 1 ? w / 2 : left + (spread * i) / Math.max(1, count - 1);
        spawn.push({ t, kind, x, pattern, dir });
        t += gap;
      }
      t += 0.38;
    };

    const isBoss = n % 8 === 0;
    const isMini = n % 4 === 0 && !isBoss;
    const isRaid = n % 7 === 0 && !isBoss && !isMini;

    if (isBoss) {
      spawn.push({ t: 0.7, kind: "boss", x: w / 2, pattern: "boss" });
      pack("sniper", n >= 16 ? 4 : 2, "snipe", 0.28);
      pack("drone", 5, "orbit", 0.1);
      pack("scout", 8, "sine", 0.08);
      if (n >= 16) spawn.push({ t: t + 0.3, kind: "mini", x: w * 0.28, pattern: "miniboss" });
      banner = `บอส · คลื่น ${n}`;
      bannerT = 2.2;
      audio.boss();
      return;
    }
    if (isMini) {
      spawn.push({ t: 0.5, kind: "mini", x: w / 2, pattern: "miniboss" });
      pack("drone", 5, "orbit", 0.1);
      pack("hunter", 4, "seek", 0.14);
      pack("sniper", 2, "snipe", 0.3);
      banner = `มินิบอส · คลื่น ${n}`;
      bannerT = 2;
      audio.wave();
      return;
    }
    if (isRaid) {
      spawn.push({ t: 0.4, kind: "mini", x: w / 2, pattern: "miniboss" });
      pack("fighter", 5, "strafe", 0.12);
      pack("hunter", 4, "seek", 0.12);
      banner = `มินิบอสจู่โจม · คลื่น ${n}`;
      bannerT = 1.8;
      audio.wave();
      return;
    }

    const scouts = Math.min(22, 7 + n * 2);
    pack("scout", Math.min(10, scouts), n % 2 === 0 ? "sine" : "dive");
    if (scouts > 10) pack("scout", scouts - 10, "strafe", 0.1, n % 2 === 0 ? 1 : -1);
    if (n >= 2) pack("hunter", Math.min(6, 2 + Math.floor(n / 2)), "seek", 0.12);
    if (n >= 2) pack("sniper", Math.min(4, 1 + Math.floor(n / 3)), "snipe", 0.26);
    if (n >= 2) pack("fighter", Math.min(8, 2 + Math.floor(n / 2)), n % 3 === 0 ? "dive" : "hold");
    if (n >= 3) pack("drone", Math.min(8, 3 + Math.floor(n / 2)), "orbit", 0.09);
    if (n >= 3) pack("bomber", n >= 7 ? 3 : n >= 5 ? 2 : 1, "hold", 0.4);
    if (n >= 6) pack("fighter", 4, "strafe", 0.14);
    if (n >= 9) pack("hunter", 4, "seek", 0.1, -1);
    banner = `คลื่น ${n}`;
    bannerT = 1.6;
    audio.wave();
  }

  function dropPickup(x: number, y: number, kind: PickupKind) {
    const p = grab(pickups);
    if (!p) return;
    p.alive = true;
    p.x = clamp(x, 28, w - 28);
    p.y = y;
    p.kind = kind;
    p.bob = 0;
  }

  function randomWeapon(): WeaponKind {
    const notMax = WEAPON_ORDER.filter((k) => player.levels[k] < 4);
    const poolKinds = notMax.length ? notMax : WEAPON_ORDER;
    return poolKinds[Math.floor(Math.random() * poolKinds.length)]!;
  }

  function drop(x: number, y: number, kind: Kind) {
    if (kind === "mini" || kind === "boss") {
      dropPickup(x, y, randomWeapon());
      if (kind === "boss") {
        dropPickup(x + 28, y + 12, Math.random() < 0.12 ? "life" : Math.random() < 0.5 ? "bomb" : "shield");
      } else if (Math.random() < 0.35) {
        dropPickup(x + 18, y + 10, "bomb");
      }
      return;
    }
    const chance = kind === "bomber" ? 0.38 : kind === "fighter" || kind === "sniper" ? 0.14 : 0.07;
    if (Math.random() > chance) return;
    const roll = Math.random();
    const pk: PickupKind =
      roll < 0.24
        ? randomWeapon()
        : roll < 0.44
          ? "multi"
          : roll < 0.66
            ? "shield"
            : roll < 0.84
              ? "speed"
              : roll < 0.97
                ? "bomb"
                : "life";
    dropPickup(x, y, pk);
  }

  function killEnemy(e: Enemy) {
    e.alive = false;
    score += e.score;
    const big = e.kind === "boss" || e.kind === "mini";
    boom(e.x, e.y, e.kind === "boss" ? 110 : e.kind === "mini" ? 86 : e.kind === "bomber" ? 70 : 48);
    floatText(e.x, e.y, `+${e.score}`);
    if (e.kind === "bomber" && wave >= 4) {
      spawnEnemy("drone", e.x - 16, "orbit");
      spawnEnemy("drone", e.x + 16, "orbit");
    }
    drop(e.x, e.y, e.kind);
    audio.explode();
    addTrauma(e.kind === "boss" ? 0.85 : e.kind === "mini" ? 0.55 : e.kind === "bomber" ? 0.45 : 0.22);
    if (big) hitstop = e.kind === "boss" ? 0.12 : 0.08;
  }

  function applyPickup(kind: PickupKind) {
    if (isWeapon(kind)) {
      const prev = player.levels[kind];
      player.levels[kind] = prev < 1 ? 1 : Math.min(4, prev + 1);
      player.weapon = kind;
      floatText(player.x, player.y - 30, `${WEAPON_NAME[kind]} Lv.${player.levels[kind]}`);
      audio.pickup();
      return;
    }
    if (kind === "multi") {
      player.multi = player.multi >= 3 ? 5 : 3;
      player.multiT = MULTI_DURATION;
      floatText(player.x, player.y - 30, "ยิงหลายนัด");
    } else if (kind === "shield") {
      player.shield = Math.min(3, player.shield + 2);
      floatText(player.x, player.y - 30, "โล่");
    } else if (kind === "speed") {
      player.speedT = SPEED_DURATION;
      floatText(player.x, player.y - 30, "ความเร็ว");
    } else if (kind === "bomb") {
      player.bombs = Math.min(MAX_BOMBS, player.bombs + 1);
      floatText(player.x, player.y - 30, "บอมบ์ +1");
    } else {
      player.lives = Math.min(MAX_LIVES, player.lives + 1);
      floatText(player.x, player.y - 30, "ชีวิต +1");
      audio.extraLife();
      return;
    }
    audio.pickup();
  }

  function hitPlayer() {
    if (player.invuln > 0 || player.deadT > 0) return;
    if (player.shield > 0) {
      player.shield -= 1;
      player.invuln = 0.45;
      addTrauma(0.25);
      audio.hit();
      burst(player.x, player.y, 10, "#9fd6ea", 140);
      return;
    }
    player.lives -= 1;
    boom(player.x, player.y, 64);
    audio.hurt();
    addTrauma(0.7);
    hitstop = 0.08;
    if (player.lives <= 0) {
      player.deadT = 0.9;
      return;
    }
    player.deadT = 0.55;
  }

  function respawn() {
    player.x = w / 2;
    player.y = h - 78;
    player.vx = 0;
    player.vy = 0;
    player.invuln = INVULN_TIME;
    player.deadT = 0;
    player.multi = 1;
    player.multiT = 0;
    player.speedT = 0;
  }

  function resetRun() {
    score = 0;
    wave = 1;
    player.lives = START_LIVES;
    player.shield = 0;
    player.multi = 1;
    player.multiT = 0;
    player.speedT = 0;
    player.weapon = "pulse";
    player.levels = { pulse: 1, spread: 0, pierce: 0, missile: 0 };
    player.bombs = START_BOMBS;
    player.bombCd = 0;
    player.invuln = 1.2;
    player.deadT = 0;
    player.x = w / 2;
    player.y = h + 72;
    player.vx = 0;
    player.vy = 0;
    openingT = 0;
    starWarp = 5.5;
    for (const list of [bullets, ebullets, enemies, pickups, particles, muzzle, booms, floaters, blasts]) {
      for (const it of list) it.alive = false;
    }
    planWave(1);
    syncHud(true);
  }

  function endRun() {
    phase = "gameover";
    const q = qualifies(save.scores, score);
    useGameStore.getState().setGameOver(score, wave, q);
  }

  function currentBoss(): Enemy | null {
    for (const e of enemies) if (e.alive && (e.kind === "mini" || e.kind === "boss")) return e;
    return null;
  }

  function unlockedWeapons() {
    return WEAPON_ORDER.filter((k) => player.levels[k] >= 1);
  }

  function fireBomb() {
    if (phase !== "playing" || player.deadT > 0) return;
    if (player.bombs <= 0 || player.bombCd > 0) return;
    player.bombs -= 1;
    player.bombCd = BOMB_COOLDOWN;
    const blast = grab(blasts);
    if (blast) {
      blast.alive = true;
      blast.x = player.x;
      blast.y = player.y;
      blast.t = 0;
      blast.size = BOMB_RADIUS;
    }
    for (const b of ebullets) if (b.alive) b.alive = false;
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      const falloff = d < BOMB_RADIUS ? 1 : d < BOMB_RADIUS * 1.45 ? 0.45 : 0.2;
      e.hp -= Math.ceil(12 * falloff) + Math.floor(wave * 0.4);
      e.flash = 0.12;
      if (e.hp <= 0) killEnemy(e);
    }
    burst(player.x, player.y, 28, "#7ec8e3", 220);
    burst(player.x, player.y, 16, "#e8eaef", 160);
    audio.bomb();
    addTrauma(0.55);
    hitstop = 0.1;
    floatText(player.x, player.y - 36, `บอมบ์ ${player.bombs}`);
    syncHud(true);
  }

  function cycleWeapon(dir: number) {
    const list = unlockedWeapons();
    if (list.length < 2) return;
    const i = list.indexOf(player.weapon);
    const next = list[(i + dir + list.length) % list.length]!;
    player.weapon = next;
    floatText(player.x, player.y - 28, `${WEAPON_NAME[next]} Lv.${player.levels[next]}`);
  }

  function selectWeapon(kind: WeaponKind) {
    if (player.levels[kind] < 1) return;
    player.weapon = kind;
    floatText(player.x, player.y - 28, `${WEAPON_NAME[kind]} Lv.${player.levels[kind]}`);
  }

  function syncHud(force = false) {
    hudClock += FIXED_DT;
    if (!force && hudClock < 0.12) return;
    hudClock = 0;
    const boss = currentBoss();
    useGameStore.getState().setHud({
      score,
      lives: player.lives,
      wave,
      shield: player.shield,
      multi: player.multi,
      speedLeft: player.speedT,
      banner: bannerT > 0 ? banner : "",
      weapon: WEAPON_NAME[player.weapon],
      weaponLevel: Math.max(1, player.levels[player.weapon]),
      bossHp: boss ? boss.hp : 0,
      bossMax: boss ? boss.max : 0,
      bossName: boss ? (boss.kind === "boss" ? "บอสใหญ่" : "มินิบอส") : "",
      bombs: player.bombs,
    });
  }

  function updatePlayer(dt: number) {
    if (player.deadT > 0) {
      player.deadT -= dt;
      if (player.deadT <= 0) {
        if (player.lives <= 0) endRun();
        else respawn();
      }
      return;
    }
    const axis = input.moveAxis();
    const speed = player.speedT > 0 ? PLAYER_BOOST_SPEED : PLAYER_SPEED;

    if (axis.x !== 0 || axis.y !== 0) input.mode = "keyboard";

    if (input.mode === "pointer" && input.pointerLive) {
      const isTouch = input.pointerDown && input.pointerId !== null;
      const tx = input.pointerX;
      const ty = isTouch ? input.pointerY - 56 : input.pointerY;
      player.x = expLerp(player.x, tx, POINTER_FOLLOW, dt);
      player.y = expLerp(player.y, ty, POINTER_FOLLOW, dt);
      player.vx = (tx - player.x) * POINTER_FOLLOW;
      player.vy = (ty - player.y) * POINTER_FOLLOW;
    } else {
      player.vx = expLerp(player.vx, axis.x * speed, PLAYER_ACCEL, dt);
      player.vy = expLerp(player.vy, axis.y * speed, PLAYER_ACCEL, dt);
      player.x += player.vx * dt;
      player.y += player.vy * dt;
    }

    player.x = clamp(player.x, 24, w - 24);
    player.y = clamp(player.y, 36, h - 24);
    player.bank = expLerp(player.bank, clamp(player.vx / speed, -1, 1) * 0.28, 18, dt);

    if (player.invuln > 0) player.invuln -= dt;
    if (player.multiT > 0) {
      player.multiT -= dt;
      if (player.multiT <= 0) player.multi = 1;
    }
    if (player.speedT > 0) player.speedT -= dt;
    if (player.bombCd > 0) player.bombCd -= dt;
    if (input.consumeBomb()) fireBomb();

    if (input.consume("Digit1")) selectWeapon("pulse");
    if (input.consume("Digit2")) selectWeapon("spread");
    if (input.consume("Digit3")) selectWeapon("pierce");
    if (input.consume("Digit4")) selectWeapon("missile");
    if (input.consume("KeyE")) cycleWeapon(1);
    if (input.consume("KeyQ")) cycleWeapon(-1);
    const padWeap = input.consumeWeaponDelta();
    if (padWeap) cycleWeapon(padWeap > 0 ? 1 : -1);

    player.fire -= dt;
    if (player.fire <= 0) {
      firePlayer();
      player.fire = fireCooldown();
    }

    const trail = grab(particles);
    if (trail) {
      trail.alive = true;
      trail.x = player.x + (Math.random() - 0.5) * 8;
      trail.y = player.y + 18;
      trail.vx = (Math.random() - 0.5) * 20;
      trail.vy = 80 + Math.random() * 40;
      trail.max = trail.life = 0.28;
      trail.size = 1.4;
      trail.color = player.speedT > 0 ? "#9ee0c2" : "#7ec8e3";
    }
  }

  function updateEnemies(dt: number) {
    const alive: Enemy[] = [];
    for (const e of enemies) if (e.alive) alive.push(e);

    for (const e of enemies) {
      if (!e.alive) continue;
      e.phase += dt;
      e.flash = Math.max(0, e.flash - dt);
      const st = stats(e.kind);
      if (e.pattern === "sine") {
        e.vy = st.speed;
        e.x = e.originX + Math.sin(e.phase * 2.2) * 70;
      } else if (e.pattern === "strafe") {
        e.vx = e.dir * st.speed * 1.15;
        e.vy = st.speed * 0.42;
        e.x += e.vx * dt;
        if (e.x < 28 || e.x > w - 28) e.dir *= -1;
      } else if (e.pattern === "hold") {
        if (e.y < 96 + (e.kind === "bomber" ? 20 : 0)) e.vy = st.speed;
        else {
          e.vy = 12;
          e.x = e.originX + Math.sin(e.phase * 0.9) * 46;
        }
      } else if (e.pattern === "snipe") {
        if (e.y < 88) e.vy = st.speed;
        else {
          e.vy = 8;
          e.x = e.originX + Math.sin(e.phase * 0.7) * 36;
        }
      } else if (e.pattern === "orbit") {
        e.vy = st.speed * 0.55;
        e.x = e.originX + Math.sin(e.phase * 2.6) * (48 + e.dir * 10);
      } else if (e.pattern === "seek") {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const m = Math.hypot(dx, dy) || 1;
        e.vx = expLerp(e.vx, (dx / m) * st.speed, 4, dt);
        e.vy = expLerp(e.vy, (dy / m) * st.speed * 0.85, 3.2, dt);
        e.x += e.vx * dt;
      } else if (e.pattern === "miniboss" || e.pattern === "boss") {
        const park = e.kind === "boss" ? 118 : 108;
        if (e.y < park) e.vy = st.speed;
        else {
          e.vy = 6;
          e.x = e.originX + Math.sin(e.phase * (e.kind === "boss" ? 0.55 : 0.8)) * Math.min(150, w * 0.28);
          e.y = clamp(e.y, park - 8, h * 0.36);
        }
      } else {
        const dx = player.x - e.x;
        const dy = player.y - e.y;
        const m = Math.hypot(dx, dy) || 1;
        e.vx = expLerp(e.vx, (dx / m) * st.speed, 3, dt);
        e.vy = expLerp(e.vy, (dy / m) * st.speed, 3, dt);
        e.x += e.vx * dt;
      }
      if (e.pattern !== "dive" && e.pattern !== "strafe") e.x = clamp(e.x, 28, w - 28);
      e.y += e.vy * dt;

      if (e.kind !== "mini" && e.kind !== "boss") {
        for (const o of alive) {
          if (o === e || o.kind === "mini" || o.kind === "boss") continue;
          const dx = e.x - o.x;
          const dy = e.y - o.y;
          const d = Math.hypot(dx, dy);
          const min = e.r + o.r;
          if (d > 0 && d < min) {
            const push = ((min - d) / d) * 0.5;
            e.x += dx * push;
            e.y += dy * push;
          }
        }
      }

      if (e.y > h + 40 && e.kind !== "mini" && e.kind !== "boss") {
        e.alive = false;
        continue;
      }

      e.fire -= dt;
      if (e.fire <= 0 && e.y > 20 && e.y < h * 0.82) {
        fireEnemy(e);
        e.fire =
          e.kind === "boss"
            ? e.hp / e.max < 0.4
              ? 0.42
              : 0.7
            : e.kind === "mini"
              ? 0.85
              : e.kind === "sniper"
                ? 1.55 - Math.min(0.4, wave * 0.03)
                : e.kind === "hunter"
                  ? 1.35
                  : e.kind === "drone"
                    ? 1.2
                    : e.kind === "scout"
                      ? 1.8 - Math.min(0.6, wave * 0.04)
                      : e.kind === "fighter"
                        ? 1.15 - Math.min(0.4, wave * 0.03)
                        : 1.35;
      }

      if (player.deadT <= 0 && player.invuln <= 0) {
        const d = Math.hypot(e.x - player.x, e.y - player.y);
        if (d < e.r + player.r) {
          e.hp -= 2;
          e.flash = 0.08;
          hitPlayer();
          if (e.hp <= 0) killEnemy(e);
        }
      }
    }
  }

  function splashAt(x: number, y: number, radius: number, dmg: number, from: Bullet) {
    for (const e of enemies) {
      if (!e.alive) continue;
      if (from.hits.includes(e)) continue;
      if (Math.hypot(e.x - x, e.y - y) < e.r + radius) {
        e.hp -= dmg;
        e.flash = 0.08;
        from.hits.push(e);
        if (e.hp <= 0) killEnemy(e);
      }
    }
  }

  function updateBullets(dt: number) {
    for (const b of bullets) {
      if (!b.alive) continue;
      if (b.homing > 0) {
        let best: Enemy | null = null;
        let bestD = 340;
        for (const e of enemies) {
          if (!e.alive) continue;
          const d = Math.hypot(e.x - b.x, e.y - b.y);
          if (d < bestD) {
            best = e;
            bestD = d;
          }
        }
        if (best) {
          const speed = Math.hypot(b.vx, b.vy) || 320;
          const dx = best.x - b.x;
          const dy = best.y - b.y;
          const m = Math.hypot(dx, dy) || 1;
          b.vx = expLerp(b.vx, (dx / m) * speed, b.homing, dt);
          b.vy = expLerp(b.vy, (dy / m) * speed, b.homing, dt);
          const sm = Math.hypot(b.vx, b.vy) || 1;
          b.vx = (b.vx / sm) * speed;
          b.vy = (b.vy / sm) * speed;
        }
      }
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.frame += dt * 12;
      if (b.life <= 0 || b.y < -30 || b.x < -24 || b.x > w + 24) {
        b.alive = false;
        continue;
      }
      for (const e of enemies) {
        if (!e.alive) continue;
        if (b.hits.includes(e)) continue;
        if (Math.hypot(b.x - e.x, b.y - e.y) < e.r + b.r) {
          e.hp -= b.dmg;
          e.flash = 0.07;
          b.hits.push(e);
          burst(b.x, b.y, 5, b.style === "missile" ? "#f2b090" : "#d9f4ff", 90);
          audio.hit();
          if (b.splash > 0) splashAt(b.x, b.y, b.splash, Math.max(1, b.dmg - 1), b);
          if (e.hp <= 0) killEnemy(e);
          if (b.pierce > 0) b.pierce -= 1;
          else {
            b.alive = false;
            break;
          }
        }
      }
    }
    for (const b of ebullets) {
      if (!b.alive) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      b.frame += dt * 10;
      if (b.life <= 0 || b.y > h + 24 || b.y < -30 || b.x < -24 || b.x > w + 24) {
        b.alive = false;
        continue;
      }
      if (player.deadT <= 0 && Math.hypot(b.x - player.x, b.y - player.y) < player.r + b.r) {
        b.alive = false;
        hitPlayer();
      }
    }
  }

  function updatePickups(dt: number) {
    for (const p of pickups) {
      if (!p.alive) continue;
      p.y += 55 * dt;
      p.bob += dt;
      if (p.y > h + 20) p.alive = false;
      if (player.deadT <= 0 && Math.hypot(p.x - player.x, p.y - player.y) < 28) {
        p.alive = false;
        applyPickup(p.kind);
      }
    }
  }

  function updateFx(dt: number) {
    trauma = Math.max(0, trauma - dt * 1.8);
    for (const p of particles) {
      if (!p.alive) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) p.alive = false;
    }
    for (const m of muzzle) {
      if (!m.alive) continue;
      m.t += dt;
      m.x = player.x;
      m.y = player.y - 26;
      if (m.t > 0.14) m.alive = false;
    }
    for (const b of booms) {
      if (!b.alive) continue;
      b.t += dt;
      if (b.t > 0.32) b.alive = false;
    }
    for (const b of blasts) {
      if (!b.alive) continue;
      b.t += dt;
      if (b.t > 0.45) b.alive = false;
    }
    for (const f of floaters) {
      if (!f.alive) continue;
      f.t -= dt;
      f.y -= 28 * dt;
      if (f.t <= 0) f.alive = false;
    }
    const parallax = player.deadT > 0 || phase === "opening" || phase === "title" ? 0 : player.vx;
    for (const s of stars) {
      const spd = (28 + s.z * 55) * starWarp;
      s.y += spd * dt;
      s.x -= parallax * (0.018 + s.z * 0.02) * dt;
      if (s.y > h + 4 + starWarp * 8) {
        s.y = -4 - Math.random() * starWarp * 6;
        s.x = Math.random() * w;
      }
      if (s.x < -4) s.x += w + 8;
      if (s.x > w + 4) s.x -= w + 8;
    }
    if (phase === "playing" && bannerT > 0) bannerT -= dt;
  }

  function updateSpawns(dt: number) {
    spawnClock += dt;
    spawn = spawn.filter((s) => {
      if (spawnClock >= s.t) {
        spawnEnemy(s.kind, s.x, s.pattern, s.dir ?? 1);
        return false;
      }
      return true;
    });
    const remaining = enemies.some((e) => e.alive) || spawn.length > 0;
    if (!remaining) {
      clearDelay += dt;
      if (clearDelay > 1.35) {
        score += 400 * wave;
        floatText(w / 2, h * 0.4, `โบนัสคลื่น +${400 * wave}`);
        wave += 1;
        planWave(wave);
      }
    } else clearDelay = 0;
  }

  function parkY() {
    return h - 78;
  }

  function finishOpening() {
    openingT = OPEN_LEN;
    starWarp = 1;
    player.x = w / 2;
    player.y = parkY();
    player.vx = 0;
    player.vy = 0;
    player.bank = 0;
    player.invuln = 1.2;
    banner = `คลื่น ${wave}`;
    bannerT = 1.6;
    phase = "playing";
    useGameStore.getState().setScreen("playing");
    syncHud(true);
  }

  function beginOpening() {
    audio.unlock();
    resetRun();
    if (reduced) {
      finishOpening();
      return;
    }
    openingT = 0;
    starWarp = 6;
    phase = "opening";
    useGameStore.getState().setScreen("opening");
    audio.intro();
  }

  function stepBoot(dt: number) {
    bootT += dt;
    const k = easeOutCubic(bootT / 1.7);
    starWarp = 1 + 3.4 * (1 - k);
    player.x = w / 2;
    player.y = h + 56 - (h + 56 - (h - 92)) * k;
    player.bank = Math.sin(bootT * 5) * 0.05 * (1 - k);
    if (bootT < 1.5 && Math.random() < 0.35) {
      burst(player.x, player.y + 20, 1, "#7ec8e3", 50);
    }
  }

  function stepOpening(dt: number) {
    openingT += dt;
    if (
      input.consume("Space") ||
      input.consume("Enter") ||
      input.consume("Escape") ||
      input.consumePause()
    ) {
      finishOpening();
      return;
    }
    const fly = easeOutCubic((openingT - 0.12) / 1.35);
    player.x = w / 2;
    player.y = h + 70 - (h + 70 - parkY()) * fly;
    player.bank = Math.sin(openingT * 7) * 0.08 * (1 - fly);
    starWarp = 1 + 7 * (1 - easeOutCubic(openingT / 2.1));
    if (openingT < 2.4 && Math.random() < 0.55) {
      burst(player.x + (Math.random() * 10 - 5), player.y + 22, 1, "#7ec8e3", 70);
    }
    if (openingT >= OPEN_LEN) finishOpening();
  }

  function step(dt: number) {
    time += dt;
    if (phase === "opening") {
      stepOpening(dt);
      updateFx(dt);
      return;
    }
    if (input.consumePause()) {
      if (phase === "playing") {
        phase = "paused";
        useGameStore.getState().setScreen("paused");
        return;
      }
      if (phase === "paused") {
        phase = "playing";
        useGameStore.getState().setScreen("playing");
        return;
      }
    }
    if (phase === "title") {
      stepBoot(dt);
      updateFx(dt);
      return;
    }
    if (phase !== "playing") {
      updateFx(dt);
      return;
    }
    if (hitstop > 0) {
      hitstop -= dt;
      updateFx(dt);
      return;
    }
    updateSpawns(dt);
    updatePlayer(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateFx(dt);
    syncHud();
  }

  function drawSprite(img: HTMLImageElement, x: number, y: number, size: number, rot: number, flash: boolean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    if (flash) {
      ctx.filter = "brightness(2.6)";
    }
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#07080c";
    ctx.fillRect(0, 0, w, h);

    const shake = trauma * trauma;
    const ox = shake ? (Math.random() * 2 - 1) * 10 * shake : 0;
    const oy = shake ? (Math.random() * 2 - 1) * 10 * shake : 0;
    ctx.save();
    ctx.translate(ox, oy);

    const g = ctx.createRadialGradient(w * 0.5, h * 0.2, 20, w * 0.5, h * 0.35, w * 0.8);
    g.addColorStop(0, "rgba(40, 64, 88, 0.22)");
    g.addColorStop(1, "rgba(7, 8, 12, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    for (const s of stars) {
      ctx.fillStyle = `rgba(232,234,239,${s.a})`;
      const streak = starWarp > 1.6 ? s.s + (starWarp - 1) * (3 + s.z * 4) : s.s;
      ctx.fillRect(s.x, s.y, s.s, streak);
    }

    if (sprites) {
      for (const p of pickups) {
        if (!p.alive) continue;
        const bob = Math.sin(p.bob * 4) * 4;
        if (p.kind === "bomb") {
          ctx.save();
          ctx.translate(p.x, p.y + bob);
          ctx.strokeStyle = "#7ec8e3";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 11, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = "#e8eaef";
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (isWeapon(p.kind)) sheetFrame(ctx, sprites.weapons, WEAPON_INDEX[p.kind], p.x, p.y + bob, 34);
        else sheetFrame(ctx, sprites.powerups, POWER_INDEX[p.kind], p.x, p.y + bob, 34);
      }
      for (const b of ebullets) {
        if (!b.alive) continue;
        sheetFrame(ctx, sprites.ebolt, Math.floor(b.frame) % 4, b.x, b.y, b.r > 5.5 ? 22 : 18);
      }
      for (const e of enemies) {
        if (!e.alive) continue;
        const img =
          e.kind === "scout" || e.kind === "hunter" || e.kind === "drone"
            ? sprites.scout
            : e.kind === "fighter" || e.kind === "sniper"
              ? sprites.fighter
              : e.kind === "mini"
                ? sprites.mini
                : e.kind === "boss"
                  ? sprites.boss
                  : sprites.bomber;
        const size =
          e.kind === "drone"
            ? 28
            : e.kind === "scout" || e.kind === "hunter"
              ? 34
              : e.kind === "fighter" || e.kind === "sniper"
                ? 46
                : e.kind === "mini"
                  ? 92
                  : e.kind === "boss"
                    ? 124
                    : 60;
        const rot = e.kind === "mini" || e.kind === "boss" ? Math.PI : Math.atan2(e.vx, -Math.max(24, e.vy));
        if (e.kind === "sniper") ctx.filter = "hue-rotate(190deg)";
        else if (e.kind === "hunter") ctx.filter = "hue-rotate(-25deg) saturate(1.25)";
        else if (e.kind === "drone") ctx.filter = "hue-rotate(95deg)";
        drawSprite(img, e.x, e.y, size, rot, e.flash > 0);
        ctx.filter = "none";
        if ((e.kind === "mini" || e.kind === "boss") && e.max > 0) {
          const bw = e.kind === "boss" ? 78 : 56;
          ctx.fillStyle = "rgba(7,8,12,0.7)";
          ctx.fillRect(e.x - bw / 2, e.y - size / 2 - 10, bw, 4);
          ctx.fillStyle = e.kind === "boss" ? "#e07a6a" : "#7ec8e3";
          ctx.fillRect(e.x - bw / 2, e.y - size / 2 - 10, bw * clamp(e.hp / e.max, 0, 1), 4);
        }
      }
      for (const b of bullets) {
        if (!b.alive) continue;
        const rot = Math.atan2(b.vx, -b.vy);
        const fi = Math.floor(b.frame) % 4;
        if (b.style === "spread") sheetFrame(ctx, sprites.pellet, fi, b.x, b.y, 12, rot);
        else if (b.style === "pierce") sheetFrame(ctx, sprites.pierce, fi, b.x, b.y, 26, rot);
        else if (b.style === "missile") sheetFrame(ctx, sprites.missile, fi, b.x, b.y, 20, rot);
        else sheetFrame(ctx, sprites.bolt, fi, b.x, b.y, 16, rot);
      }
      for (const m of muzzle) {
        if (!m.alive) continue;
        sheetFrame(ctx, sprites.muzzle, Math.min(3, Math.floor(m.t / 0.035)), m.x, m.y, m.size);
      }
      if (player.deadT <= 0 && (player.invuln <= 0 || Math.floor(time * 16) % 2 === 0 || phase === "opening" || phase === "title")) {
        if (phase === "opening" || phase === "title") {
          ctx.save();
          ctx.globalAlpha = 0.4 + Math.sin(time * 14) * 0.12;
          ctx.fillStyle = "#7ec8e3";
          ctx.beginPath();
          ctx.ellipse(player.x, player.y + 24, 5 + starWarp * 0.4, 14 + starWarp, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        if (player.shield > 0) {
          ctx.save();
          ctx.translate(player.x, player.y);
          ctx.rotate(time * 1.4);
          ctx.strokeStyle = `rgba(126,200,227,${0.45 + player.shield * 0.12})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, 26 + Math.sin(time * 6) * 1.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        drawSprite(sprites.player, player.x, player.y, PLAYER_SIZE, player.bank, false);
      }
      for (const b of booms) {
        if (!b.alive) continue;
        sheetFrame(ctx, sprites.explode, Math.min(3, Math.floor(b.t / 0.08)), b.x, b.y, b.size);
      }
      for (const b of blasts) {
        if (!b.alive) continue;
        const k = clamp(b.t / 0.45, 0, 1);
        const r = 24 + b.size * k;
        ctx.save();
        ctx.globalAlpha = 0.55 * (1 - k);
        ctx.strokeStyle = "#7ec8e3";
        ctx.lineWidth = 6 - k * 4;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#e8eaef";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    for (const p of particles) {
      if (!p.alive) continue;
      ctx.globalAlpha = p.life / p.max;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = "#e8eaef";
    ctx.font = "600 13px 'IBM Plex Sans Thai', sans-serif";
    ctx.textAlign = "center";
    for (const f of floaters) {
      if (!f.alive) continue;
      ctx.globalAlpha = Math.min(1, f.t * 2);
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }

    if (bannerT > 0 && phase === "playing") {
      ctx.globalAlpha = Math.min(1, bannerT * 1.4);
      ctx.fillStyle = "#e8eaef";
      ctx.font = "600 28px Oxanium, sans-serif";
      ctx.fillText(banner, w / 2, h * 0.28);
      ctx.globalAlpha = 1;
    }

    if (phase === "opening") {
      const titleA =
        easeOutCubic((openingT - 0.55) / 0.4) * (1 - clamp((openingT - 3.15) / 0.55, 0, 1));
      if (titleA > 0) {
        const size = Math.min(62, w * 0.14);
        ctx.save();
        ctx.globalAlpha = titleA;
        ctx.textAlign = "center";
        ctx.fillStyle = "#e8eaef";
        ctx.font = `600 ${size}px Oxanium, sans-serif`;
        ctx.fillText("NOVA", w / 2, h * 0.26);
        ctx.fillStyle = "#7ec8e3";
        ctx.fillText("DRIFT", w / 2, h * 0.26 + size * 0.95);
        ctx.restore();
      }
      const subA =
        easeOutCubic((openingT - 1.45) / 0.35) * (1 - clamp((openingT - 3.25) / 0.45, 0, 1));
      if (subA > 0) {
        ctx.save();
        ctx.globalAlpha = subA;
        ctx.textAlign = "center";
        ctx.fillStyle = "#8b919d";
        ctx.font = "500 14px 'IBM Plex Sans Thai', sans-serif";
        ctx.fillText("ภารกิจเริ่ม · คลื่น 1", w / 2, h * 0.26 + Math.min(62, w * 0.14) * 1.7);
        ctx.restore();
      }
    }

    const vg = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, w * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.38)");
    ctx.fillStyle = vg;
    ctx.fillRect(-20, -20, w + 40, h + 40);

    ctx.restore();
  }

  function frame(t: number) {
    if (!running) return;
    if (!last) last = t;
    let dt = (t - last) / 1000;
    last = t;
    dt = Math.min(dt, MAX_FRAME_DT);
    acc += dt;
    while (acc >= FIXED_DT) {
      step(FIXED_DT);
      acc -= FIXED_DT;
    }
    render();
    raf = requestAnimationFrame(frame);
  }

  function getYaw() {
    const axis = input.moveAxis();
    if (axis.x === 0 && axis.y === 0) {
      const sp = Math.hypot(player.vx, player.vy);
      if (sp < 8) return yawMem;
      yawMem = Math.atan2(-player.vx, -player.vy);
      return yawMem;
    }
    yawMem = Math.atan2(-axis.x, -axis.y);
    return yawMem;
  }

  function getSpeed() {
    return Math.hypot(player.vx, player.vy);
  }

  const handle: GameHandle & { destroy: () => void } = {
    start() {
      beginOpening();
    },
    resume() {
      if (phase === "paused") {
        phase = "playing";
        useGameStore.getState().setScreen("playing");
      }
    },
    pause() {
      if (phase === "playing") {
        phase = "paused";
        useGameStore.getState().setScreen("paused");
      }
    },
    restart() {
      beginOpening();
    },
    toTitle() {
      phase = "title";
      bootT = 0;
      starWarp = 3.2;
      player.x = w / 2;
      player.y = h + 50;
      for (const list of [bullets, ebullets, enemies, pickups]) for (const it of list) it.alive = false;
      useGameStore.getState().setScreen("title");
    },
    toScores() {
      useGameStore.getState().setScreen("scores");
    },
    toBoard() {
      useGameStore.getState().setScreen("board");
      useGameStore.getState().setBoardStatus("loading");
      void listBoard()
        .then((rows) => useGameStore.getState().setBoard(rows))
        .catch(() => useGameStore.getState().setBoardStatus("error"));
    },
    submitName(name: string) {
      const tag = cleanTag(name);
      save = insertScore(save, {
        name: tag,
        score,
        wave,
        at: Date.now(),
      });
      useGameStore.getState().setScores(save.scores);
      useGameStore.getState().setScreen("board");
      useGameStore.getState().setBoardStatus("loading");
      void submitBoard({ data: { tag, score, wave } })
        .then((rows) => useGameStore.getState().setBoard(rows))
        .catch(() => {
          useGameStore.getState().setBoardStatus("error");
          void listBoard()
            .then((rows) => useGameStore.getState().setBoard(rows))
            .catch(() => useGameStore.getState().setBoardStatus("error"));
        });
    },
    toggleMute() {
      save = patchSettings(save, { muted: !save.muted });
      audio.setMuted(save.muted);
      useGameStore.getState().setMuted(save.muted);
    },
    toggleShake() {
      save = patchSettings(save, { shake: !save.shake });
      useGameStore.getState().setShake(save.shake);
    },
    unlockAudio() {
      audio.unlock();
    },
    cycleWeapon() {
      cycleWeapon(1);
    },
    skipOpening() {
      if (phase === "opening") finishOpening();
    },
    fireBomb() {
      fireBomb();
    },
    destroy() {
      running = false;
      cancelAnimationFrame(raf);
      input.destroy();
      window.removeEventListener("resize", resize);
      if (window.__controlsTest) delete window.__controlsTest;
    },
  };

  window.__controlsTest = {
    getYaw,
    getSpeed,
    setSteer(v: number) {
      if (v > 0.2) input.setKeys(["KeyW", "KeyA"]);
      else if (v < -0.2) input.setKeys(["KeyW", "KeyD"]);
      else input.setKeys(["KeyW"]);
    },
    setKeys(codes: string[]) {
      if (codes.length === 0) input.clearInjected();
      else input.setKeys(codes);
    },
    skipToWave(n: number) {
      wave = Math.max(1, Math.floor(n));
      player.deadT = 0;
      if (player.lives < 1) player.lives = START_LIVES;
      player.invuln = 0.8;
      player.x = w / 2;
      player.y = parkY();
      starWarp = 1;
      openingT = OPEN_LEN;
      for (const list of [bullets, ebullets, enemies, pickups]) for (const it of list) it.alive = false;
      spawn = [];
      if (phase !== "playing") {
        phase = "playing";
        useGameStore.getState().setScreen("playing");
      }
      planWave(wave);
      syncHud(true);
    },
    giveWeapons() {
      player.levels = { pulse: 3, spread: 3, pierce: 3, missile: 3 };
      player.weapon = "spread";
      player.bombs = MAX_BOMBS;
      syncHud(true);
    },
  };

  resize();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") audio.unlock();
    else input.keys.clear();
  });

  void loadSprites()
    .then((s) => {
      sprites = s;
      useGameStore.getState().setLoaded(true);
    })
    .catch(() => {
      useGameStore.getState().setLoaded(true);
    });

  audio.setMuted(save.muted);
  writeSave(save);
  useGameStore.getState().setScores(save.scores);
  useGameStore.getState().setMuted(save.muted);
  useGameStore.getState().setShake(save.shake);
  raf = requestAnimationFrame(frame);

  return handle;
}

declare global {
  interface Window {
    __controlsTest?: {
      getYaw: () => number;
      getSpeed: () => number;
      setSteer?: (v: number) => void;
      setKeys?: (codes: string[]) => void;
      skipToWave?: (n: number) => void;
      giveWeapons?: () => void;
    };
  }
}
