import { Overlays } from "@/components/overlays";
import { createGame } from "@/game/game";
import type { GameHandle } from "@/game/store";
import { useEffect, useRef, useState } from "react";

export function GameView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [game, setGame] = useState<GameHandle | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const instance = createGame(canvas);
    setGame(instance);
    return () => instance.destroy();
  }, []);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ touchAction: "none", cursor: "crosshair" }}
      />
      <Overlays game={game} />
    </div>
  );
}
