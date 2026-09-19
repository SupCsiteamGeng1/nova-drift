#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sprites");
if (!existsSync(dir)) process.exit(0);

let restored = 0;
for (const name of readdirSync(dir)) {
  if (!name.endsWith(".png.b64")) continue;
  const pngName = name.slice(0, -4); // strip .b64
  const pngPath = join(dir, pngName);
  const buf = Buffer.from(readFileSync(join(dir, name), "utf8"), "base64");
  writeFileSync(pngPath, buf);
  restored += 1;
}
if (restored) console.log(`restored ${restored} sprite PNG(s)`);
