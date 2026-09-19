export type Sprites = {
  player: HTMLImageElement;
  scout: HTMLImageElement;
  fighter: HTMLImageElement;
  bomber: HTMLImageElement;
  mini: HTMLImageElement;
  boss: HTMLImageElement;
  powerups: HTMLImageElement;
  weapons: HTMLImageElement;
  bolt: HTMLImageElement;
  ebolt: HTMLImageElement;
  pierce: HTMLImageElement;
  missile: HTMLImageElement;
  pellet: HTMLImageElement;
  muzzle: HTMLImageElement;
  explode: HTMLImageElement;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${src}`));
    img.src = src;
  });
}

export async function loadSprites(): Promise<Sprites> {
  const [
    player,
    scout,
    fighter,
    bomber,
    mini,
    boss,
    powerups,
    weapons,
    bolt,
    ebolt,
    pierce,
    missile,
    pellet,
    muzzle,
    explode,
  ] = await Promise.all([
    loadImage("/sprites/player.png"),
    loadImage("/sprites/scout.png"),
    loadImage("/sprites/fighter.png"),
    loadImage("/sprites/bomber.png"),
    loadImage("/sprites/mini.png"),
    loadImage("/sprites/boss.png"),
    loadImage("/sprites/powerups.png"),
    loadImage("/sprites/weapons.png"),
    loadImage("/sprites/bolt.png"),
    loadImage("/sprites/ebolt.png"),
    loadImage("/sprites/pierce.png"),
    loadImage("/sprites/missile.png"),
    loadImage("/sprites/pellet.png"),
    loadImage("/sprites/muzzle.png"),
    loadImage("/sprites/explode.png"),
  ]);
  return {
    player,
    scout,
    fighter,
    bomber,
    mini,
    boss,
    powerups,
    weapons,
    bolt,
    ebolt,
    pierce,
    missile,
    pellet,
    muzzle,
    explode,
  };
}

export function sheetFrame(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  index: number,
  x: number,
  y: number,
  size: number,
  rotation = 0,
  cols = 2,
) {
  const fw = img.width / cols;
  const rows = Math.max(1, Math.round(img.height / fw));
  const fh = img.height / rows;
  const col = index % cols;
  const row = Math.floor(index / cols);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.drawImage(img, col * fw, row * fh, fw, fh, -size / 2, -size / 2, size, size);
  ctx.restore();
}
