create table if not exists scores (
  id serial primary key,
  tag text not null,
  score integer not null,
  wave integer not null,
  created_at timestamptz not null default now()
);
create index if not exists scores_score_idx on scores (score desc, created_at asc);
