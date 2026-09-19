import type { ReactNode } from "react";
import { Bomb, Crosshair, LayoutDashboard, Pause, Shield, Volume2, VolumeX, Waves, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { GameHandle } from "@/game/store";
import { useGameStore } from "@/game/store";
import { useState } from "react";

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-auto w-full max-w-md rounded-xl border border-border bg-card/92 px-5 py-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:px-6 sm:py-7">
      {children}
    </div>
  );
}

function TitleMark() {
  return (
    <div className="mb-4 text-center sm:mb-6">
      <p className="mb-2 font-display text-xs font-medium tracking-[0.28em] text-accent uppercase">
        Top-down raid
      </p>
      <h1 className="font-display text-4xl font-semibold leading-none tracking-tight text-foreground sm:text-6xl">
        NOVA
        <span className="block text-accent">DRIFT</span>
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted sm:mt-4">
        เรดคลื่นศัตรูในห้วงอวกาศ เก็บพาวเวอร์อัพแล้วทะลุคลื่นให้ได้ไกลที่สุด
      </p>
    </div>
  );
}

export function Overlays({ game }: { game: GameHandle | null }) {
  const screen = useGameStore((s) => s.screen);
  const loaded = useGameStore((s) => s.loaded);
  const hud = useGameStore((s) => s.hud);
  const muted = useGameStore((s) => s.muted);
  const shake = useGameStore((s) => s.shake);
  const scores = useGameStore((s) => s.scores);
  const board = useGameStore((s) => s.board);
  const boardStatus = useGameStore((s) => s.boardStatus);
  const lastScore = useGameStore((s) => s.lastScore);
  const lastWave = useGameStore((s) => s.lastWave);
  const [name, setName] = useState("นักบิน");
  const [fromPause, setFromPause] = useState(false);

  const goScores = (paused: boolean) => {
    setFromPause(paused);
    game?.toScores();
  };

  const goBoard = (paused: boolean) => {
    setFromPause(paused);
    game?.toBoard();
  };

  const backFromLists = () => {
    if (fromPause) useGameStore.getState().setScreen("paused");
    else useGameStore.getState().setScreen("title");
  };

  return (
    <>
      {screen === "playing" && (
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
              <p className="text-[11px] font-medium tracking-wider text-muted uppercase">คะแนน</p>
              <p className="font-display text-xl font-semibold tabular-nums leading-none">{hud.score}</p>
            </div>
            <div className="rounded-lg border border-border bg-card/80 px-3 py-2 text-center">
              <p className="text-[11px] font-medium tracking-wider text-muted uppercase">คลื่น</p>
              <p className="font-display text-xl font-semibold tabular-nums leading-none">{hud.wave}</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
                <p className="text-[11px] font-medium tracking-wider text-muted uppercase">ชีวิต</p>
                <p className="font-display text-xl font-semibold tabular-nums leading-none text-accent">
                  {hud.lives}
                </p>
              </div>
              <Button
                variant="subtle"
                size="icon"
                className="pointer-events-auto"
                aria-label="หยุดเกม"
                onClick={() => game?.pause()}
              >
                <Pause className="size-4" />
              </Button>
            </div>
          </div>
            {hud.bossMax > 0 ? (
              <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-medium tracking-wider text-accent uppercase">{hud.bossName}</p>
                  <p className="font-display text-[11px] tabular-nums text-muted">
                    {Math.max(0, Math.ceil(hud.bossHp))}/{hud.bossMax}
                  </p>
                </div>
                <div className="h-1.5 overflow-hidden rounded-sm bg-card-2">
                  <div
                    className="h-full origin-left bg-danger"
                    style={{ transform: `scaleX(${Math.max(0, Math.min(1, hud.bossHp / hud.bossMax))})` }}
                  />
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              className="pointer-events-auto inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card/80 px-2.5 py-1.5 text-xs text-foreground"
              onClick={() => game?.cycleWeapon()}
            >
              <Crosshair className="size-3.5 text-accent" />
              {hud.weapon} Lv.{hud.weaponLevel}
            </button>
            {hud.shield > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/80 px-2.5 py-1.5 text-xs text-accent">
                <Shield className="size-3.5" /> โล่ {hud.shield}
              </span>
            )}
            {hud.multi > 1 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/80 px-2.5 py-1.5 text-xs text-foreground">
                <Waves className="size-3.5" /> ยิง {hud.multi} นัด
              </span>
            )}
            {hud.speedLeft > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/80 px-2.5 py-1.5 text-xs text-ok">
                <Zap className="size-3.5" /> ความเร็ว {Math.ceil(hud.speedLeft)}วินาที
              </span>
            )}
            <button
              type="button"
              className="pointer-events-auto inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md border border-border bg-card/80 px-2.5 py-1.5 text-xs text-foreground"
              onClick={() => game?.fireBomb()}
              disabled={hud.bombs <= 0}
            >
              <Bomb className="size-3.5 text-accent" />
              บอมบ์ {hud.bombs}
            </button>
          </div>
        </div>
      )}

      {screen === "opening" && (
        <button
          type="button"
          className="absolute inset-0 flex flex-col items-center justify-end pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
          aria-label="ข้ามตอนเปิด"
          onClick={() => {
            game?.unlockAudio();
            game?.skipOpening();
          }}
        >
          <p className="rounded-md border border-border bg-card/70 px-3 py-2 text-xs text-muted">
            แตะหรือกด Space เพื่อข้าม
          </p>
        </button>
      )}

      {screen !== "playing" && screen !== "opening" && (
        <div className="absolute inset-0 overflow-y-auto bg-background/55 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex min-h-full items-center justify-center">
          {screen === "title" && (
            <Panel>
              <TitleMark />
              <div className="flex flex-col gap-3">
                <Button
                  disabled={!loaded || !game}
                  onClick={() => {
                    game?.unlockAudio();
                    game?.start();
                  }}
                >
                  {loaded ? "เริ่มภารกิจ" : "กำลังโหลด"}
                </Button>
                <Button variant="ghost" onClick={() => goScores(false)}>
                  คะแนนเครื่องนี้
                </Button>
                <Button variant="ghost" onClick={() => goBoard(false)}>
                  <LayoutDashboard className="size-4" />
                  แดชบอร์ดแข่ง
                </Button>
              </div>
              <ul className="mt-4 space-y-1 text-xs leading-relaxed text-muted sm:mt-6 sm:space-y-1.5">
                <li>คีย์บอร์ด WASD หรือลูกศร — เคลื่อนที่นุ่มนวล</li>
                <li>เมาส์หรือนิ้ว — ลากยานตามตัวชี้</li>
                <li>ยิงอัตโนมัติ · Esc / P หยุดเกม · 1–4 / Q E เปลี่ยนปืน</li>
                <li>Shift / B / F — โจมตีวงกว้าง จำกัดจำนวนครั้ง</li>
                <li>พาวเวอร์อัพ: ยิงหลายนัด · โล่ · ความเร็ว · บอมบ์ · ชีวิต (หายาก)</li>
                <li>เก็บเพชรอาวุธเพื่อเปลี่ยนกระสุนและอัปเกรดได้ถึงเลเวล 4</li>
                <li>มินิบอสทุก 4 คลื่น · บอสทุก 8 · จู่โจมทุก 7</li>
              </ul>
            </Panel>
          )}

          {screen === "paused" && (
            <Panel>
              <h2 className="font-display mb-1 text-2xl font-semibold tracking-tight">หยุดชั่วคราว</h2>
              <p className="mb-6 text-sm text-muted">คลื่น {hud.wave} · คะแนน {hud.score}</p>
              <div className="flex flex-col gap-3">
                <Button onClick={() => game?.resume()}>เล่นต่อ</Button>
                <Button variant="ghost" onClick={() => game?.restart()}>
                  เริ่มคลื่นใหม่
                </Button>
                <Button variant="ghost" onClick={() => goScores(true)}>
                  คะแนนเครื่องนี้
                </Button>
                <Button variant="ghost" onClick={() => goBoard(true)}>
                  แดชบอร์ดแข่ง
                </Button>
                <div className="mt-1 flex gap-2">
                  <Button variant="subtle" className="flex-1" onClick={() => game?.toggleMute()}>
                    {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                    {muted ? "เปิดเสียง" : "ปิดเสียง"}
                  </Button>
                  <Button variant="subtle" className="flex-1" onClick={() => game?.toggleShake()}>
                    สั่นจอ {shake ? "เปิด" : "ปิด"}
                  </Button>
                </div>
                <Button variant="ghost" onClick={() => game?.toTitle()}>
                  เมนูหลัก
                </Button>
              </div>
            </Panel>
          )}

          {screen === "gameover" && (
            <Panel>
              <h2 className="font-display mb-1 text-2xl font-semibold tracking-tight">ภารกิจสิ้นสุด</h2>
              <p className="mb-1 font-display text-4xl font-semibold tabular-nums text-accent">{lastScore}</p>
              <p className="mb-6 text-sm text-muted">ถึงคลื่น {lastWave}</p>
              {lastScore > 0 ? (
                <form
                  className="mb-4 flex flex-col gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    game?.submitName(name);
                  }}
                >
                  <label className="text-xs font-medium tracking-wide text-muted">
                    บันทึกรหัสนักบินลงแดชบอร์ดแข่ง
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      maxLength={12}
                      className="mt-1.5 min-h-11 w-full rounded-md border border-border bg-card-2 px-3 text-sm text-foreground outline-none focus:outline-2 focus:outline-offset-2 focus:outline-accent"
                    />
                  </label>
                  <Button type="submit">ส่งคะแนนแข่ง</Button>
                </form>
              ) : null}
              <div className="flex flex-col gap-3">
                <Button onClick={() => game?.restart()}>เล่นอีกครั้ง</Button>
                <Button variant="ghost" onClick={() => goBoard(false)}>
                  แดชบอร์ดแข่ง
                </Button>
                <Button variant="ghost" onClick={() => game?.toTitle()}>
                  เมนูหลัก
                </Button>
              </div>
            </Panel>
          )}

          {screen === "scores" && (
            <Panel>
              <h2 className="font-display mb-4 text-2xl font-semibold tracking-tight">คะแนนเครื่องนี้</h2>
              {scores.length === 0 ? (
                <p className="mb-6 text-sm text-muted">ยังไม่มีสถิติ — จบภารกิจแล้วชื่อจะขึ้นที่นี่</p>
              ) : (
                <ol className="mb-6 divide-y divide-border">
                  {scores.map((row, i) => (
                    <li key={`${row.at}-${row.name}`} className="flex items-baseline justify-between gap-3 py-2.5">
                      <span className="text-sm text-muted tabular-nums">{i + 1}</span>
                      <span className="flex-1 text-sm font-medium">{row.name}</span>
                      <span className="font-display text-sm tabular-nums text-accent">{row.score}</span>
                      <span className="text-xs text-faint">ว.{row.wave}</span>
                    </li>
                  ))}
                </ol>
              )}
              <Button variant="ghost" className="w-full" onClick={backFromLists}>
                กลับ
              </Button>
            </Panel>
          )}

          {screen === "board" && (
            <Panel>
              <h2 className="font-display mb-1 text-2xl font-semibold tracking-tight">แดชบอร์ดแข่ง</h2>
              <p className="mb-4 text-xs leading-relaxed text-muted">
                คะแนนร่วมทุกเครื่อง — จบภารกิจแล้วส่งรหัสนักบินเพื่อขึ้นอันดับ
              </p>
              {boardStatus === "loading" && board.length === 0 ? (
                <p className="mb-6 text-sm text-muted">กำลังโหลดอันดับ</p>
              ) : boardStatus === "error" && board.length === 0 ? (
                <p className="mb-6 text-sm text-muted">โหลดกระดานไม่ได้ — ลองอีกครั้ง</p>
              ) : board.length === 0 ? (
                <p className="mb-6 text-sm text-muted">ยังไม่มีผู้เล่น — เป็นคนแรกได้เลย</p>
              ) : (
                <ol className="mb-6 divide-y divide-border">
                  {board.map((row, i) => (
                    <li key={row.id} className="flex items-baseline justify-between gap-3 py-2.5">
                      <span className="text-sm text-muted tabular-nums">{i + 1}</span>
                      <span className="flex-1 text-sm font-medium">{row.tag}</span>
                      <span className="font-display text-sm tabular-nums text-accent">{row.score}</span>
                      <span className="text-xs text-faint">ว.{row.wave}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex flex-col gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    game?.toBoard();
                  }}
                >
                  รีเฟรช
                </Button>
                <Button variant="ghost" onClick={backFromLists}>
                  กลับ
                </Button>
              </div>
            </Panel>
          )}
          </div>
        </div>
      )}
    </>
  );
}
