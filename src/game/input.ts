const GAME_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowLeft",
  "ArrowDown",
  "ArrowRight",
  "Space",
  "Escape",
  "KeyP",
  "Enter",
  "Digit1",
  "Digit2",
  "Digit3",
  "Digit4",
  "KeyQ",
  "KeyE",
  "KeyB",
  "KeyF",
  "ShiftLeft",
]);

function radialDeadzone(x: number, y: number, dz = 0.18) {
  const m = Math.hypot(x, y);
  if (m < dz) return { x: 0, y: 0 };
  const scale = (m - dz) / (1 - dz) / m;
  return { x: x * scale, y: y * scale };
}

export class Input {
  keys = new Set<string>();
  injected: string[] | null = null;
  pointerDown = false;
  pointerId: number | null = null;
  pointerX = 0;
  pointerY = 0;
  pointerLive = false;
  mode: "keyboard" | "pointer" = "keyboard";
  pauseQueued = false;
  weaponDelta = 0;
  bombQueued = false;
  private padPauseHeld = false;
  private padWeapHeld = false;
  private padBombHeld = false;
  private canvas: HTMLCanvasElement;
  private onBlur: () => void;
  private onKeyDown: (e: KeyboardEvent) => void;
  private onKeyUp: (e: KeyboardEvent) => void;
  private onPointerDown: (e: PointerEvent) => void;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerUp: (e: PointerEvent) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.onBlur = () => {
      this.keys.clear();
      this.pointerDown = false;
    };
    this.onKeyDown = (e) => {
      if (this.injected) return;
      if (GAME_CODES.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.mode = "keyboard";
      if (e.code === "Escape" || e.code === "KeyP") this.pauseQueued = true;
      if (e.code === "KeyB" || e.code === "KeyF" || e.code === "ShiftLeft") this.bombQueued = true;
    };
    this.onKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    this.onPointerDown = (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      this.pointerDown = true;
      this.pointerId = e.pointerId;
      this.syncPointer(e);
      this.mode = "pointer";
      this.pointerLive = true;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    this.onPointerMove = (e) => {
      if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
      this.syncPointer(e);
      if (this.pointerDown || e.pointerType === "mouse") {
        this.mode = "pointer";
        this.pointerLive = true;
      }
    };
    this.onPointerUp = (e) => {
      if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
      this.pointerDown = false;
      this.pointerId = null;
    };

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onBlur);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
  }

  private syncPointer(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointerX = ((e.clientX - rect.left) / rect.width) * this.canvas.clientWidth;
    this.pointerY = ((e.clientY - rect.top) / rect.height) * this.canvas.clientHeight;
  }

  setKeys(codes: string[]) {
    this.injected = codes;
    this.mode = "keyboard";
    this.pointerLive = false;
  }

  clearInjected() {
    this.injected = null;
  }

  held(): Set<string> {
    if (this.injected) return new Set(this.injected);
    return this.keys;
  }

  moveAxis(): { x: number; y: number } {
    const k = this.held();
    let x = 0;
    let y = 0;
    if (k.has("KeyA") || k.has("ArrowLeft")) x -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) x += 1;
    if (k.has("KeyW") || k.has("ArrowUp")) y -= 1;
    if (k.has("KeyS") || k.has("ArrowDown")) y += 1;

    const pads = typeof navigator !== "undefined" ? navigator.getGamepads?.() : null;
    if (pads) {
      for (const pad of pads) {
        if (!pad) continue;
        const stick = radialDeadzone(pad.axes[0] || 0, pad.axes[1] || 0);
        x += stick.x;
        y += stick.y;
        if (pad.buttons[12]?.pressed) y -= 1;
        if (pad.buttons[13]?.pressed) y += 1;
        if (pad.buttons[14]?.pressed) x -= 1;
        if (pad.buttons[15]?.pressed) x += 1;
        const start = Boolean(pad.buttons[9]?.pressed);
        if (start && !this.padPauseHeld) this.pauseQueued = true;
        this.padPauseHeld = start;
        const lb = Boolean(pad.buttons[4]?.pressed);
        const rb = Boolean(pad.buttons[5]?.pressed);
        if (lb && !this.padWeapHeld) this.weaponDelta -= 1;
        if (rb && !this.padWeapHeld) this.weaponDelta += 1;
        this.padWeapHeld = lb || rb;
        const bombBtn = Boolean(pad.buttons[1]?.pressed || pad.buttons[2]?.pressed);
        if (bombBtn && !this.padBombHeld) this.bombQueued = true;
        this.padBombHeld = bombBtn;
      }
    }

    x = Math.max(-1, Math.min(1, x));
    y = Math.max(-1, Math.min(1, y));
    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    return { x, y };
  }

  consumePause() {
    const v = this.pauseQueued;
    this.pauseQueued = false;
    return v;
  }

  consume(code: string) {
    if (this.injected) {
      const i = this.injected.indexOf(code);
      if (i < 0) return false;
      this.injected = this.injected.filter((c) => c !== code);
      return true;
    }
    if (!this.keys.has(code)) return false;
    this.keys.delete(code);
    return true;
  }

  consumeWeaponDelta() {
    const v = this.weaponDelta;
    this.weaponDelta = 0;
    return v;
  }

  consumeBomb() {
    const v = this.bombQueued;
    this.bombQueued = false;
    return v;
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onBlur);
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
  }
}
