import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type BoardRow = {
  id: number;
  tag: string;
  score: number;
  wave: number;
  created_at: string;
};

export function cleanTag(raw: string) {
  const t = String(raw || "")
    .replace(/[^\wก-๙]+/g, "")
    .slice(0, 12);
  return t || "นักบิน";
}

export const listBoard = createServerFn({ method: "GET" }).handler(async () => {
  const { getSql } = await import("@/lib/db");
  const sql = await getSql();
  return sql<BoardRow>`
    select id, tag, score, wave, created_at::text as created_at
    from scores
    order by score desc, created_at asc
    limit 40
  `;
});

const Submit = z.object({
  tag: z.string().min(1).max(16),
  score: z.number().int().min(1).max(9_999_999),
  wave: z.number().int().min(1).max(999),
});

export const submitBoard = createServerFn({ method: "POST" })
  .validator((data: unknown) => Submit.parse(data))
  .handler(async ({ data }) => {
    const { getSql } = await import("@/lib/db");
    const sql = await getSql();
    const tag = cleanTag(data.tag);
    await sql`
      insert into scores (tag, score, wave)
      values (${tag}, ${data.score}, ${data.wave})
    `;
    return sql<BoardRow>`
      select id, tag, score, wave, created_at::text as created_at
      from scores
      order by score desc, created_at asc
      limit 40
    `;
  });
