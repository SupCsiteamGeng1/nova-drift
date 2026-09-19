# NOVA DRIFT

เกมยิงอวกาศมุมบนลงล่าง (TanStack Start + React 19 + Canvas 2D)

แพ็กเกจนี้คือซอร์สสำหรับพัฒนาต่อ ไม่ใช่ไฟล์ที่เปิดเล่นจาก Google Drive ได้โดยตรง

## ดาวน์โหลดซอร์ส

GitHub (บัญชีที่เชื่อมไว้): https://github.com/SupCsiteamGeng1/nova-drift

```bash
git clone https://github.com/SupCsiteamGeng1/nova-drift.git
cd nova-drift
npm install
npm run dev
```

`npm install` จะแตกไฟล์สไปรต์จาก `.png.b64` ให้เอง

โฟลเดอร์ Google Drive สำหรับวาง zip: https://drive.google.com/drive/folders/1LhoI4x8YsWaFpQ8Igss6qIiWH1Vkddf4

## รันบนเครื่อง

ต้องมี Node.js 20+

```bash
npm install
npm run dev
```

เปิดเบราว์เซอร์ที่พอร์ตที่สคริปต์ `dev` ใช้ (ค่าเริ่มต้น 8080)

```bash
npm run typecheck
npm run build
```

ฐานข้อมูลคะแนนแข่งใช้ PGLite ในเครื่อง (ไม่ต้องตั้ง Neon ก็เล่นแดชบอร์ดได้)  
ถ้าจะใช้ Postgres จริง ตั้ง `DATABASE_URL` แล้วรัน `npm run db:migrate`

## สแต็ก

- TanStack Start + React 19 + Tailwind v4
- Canvas 2D เกมลูปใน `src/game/game.ts`
- คะแนนแข่ง: `src/lib/board.ts` + ตาราง `migrations/0002_scores.sql`
- Auth ปิด (`VITE_AUTH_ENABLED=false` ใน `.grok/app-env.json`)

## ไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
|---|---|
| `src/game/game.ts` | คลื่นศัตรู, บอส, บอมบ์, อาวุธ |
| `src/game/constants.ts` | ค่าบาลานซ์ ความเร็ว คลื่น บอมบ์ |
| `src/game/input.ts` | WASD / ลูกศร / เมาส์ / บอมบ์ |
| `src/components/overlays.tsx` | HUD, เมนู, แดชบอร์ดแข่ง |
| `src/game/store.ts` | สถานะจอและ HUD |
| `public/sprites/` | สไปรต์ยาน / ศัตรู / กระสุน |
| `src/lib/board.ts` | รายชื่อและส่งคะแนน |

## วิธีเล่น (สรุป)

- เคลื่อนที่ WASD หรือลูกศร หรือตามตัวชี้
- ยิงอัตโนมัติ — สลับอาวุธ `1–4` / `Q` `E`
- บอมบ์วงกว้าง `Space` หรือปุ่มใน HUD (จำกัดจำนวน)
- มินิบอส / บอส ตามคลื่น
- จบเกมแล้วส่งรหัสนักบินที่แดชบอร์ดแข่ง
