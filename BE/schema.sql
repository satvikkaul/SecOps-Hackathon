-- Applied on every startup (idempotent). Can also be pasted into the Supabase SQL editor.

create table if not exists assessments (
  id           uuid primary key default gen_random_uuid(),
  share_token  text unique not null,          -- unguessable, secrets.token_urlsafe(16); demo rows use fixed tokens
  company      text not null,
  domain       text,
  profile      jsonb not null,                -- business profile: sector, employees, ...
  answers      jsonb not null,                -- Q1..Qn -> yes|partial|no|unsure|na
  ranking_mode text not null check (ranking_mode in ('effort', 'cost')),
  results      jsonb not null,                -- FE-computed snapshot: posture, scenarios, topActions, cccs
  dns          jsonb,                         -- BE-verified DNS result at creation time
  created_at   timestamptz not null default now(),
  expires_at   timestamptz                    -- link stops working after this; null = never (demo rows)
);
alter table assessments add column if not exists expires_at timestamptz;
-- scrypt$<n>$<r>$<p>$<salt b64>$<hash b64>. The viewer must enter the password; null = open link (demo rows).
alter table assessments add column if not exists password_hash text;

create table if not exists dns_checks (
  domain     text primary key,
  result     jsonb not null,
  pinned     boolean not null default false, -- demo rows: never refreshed by a live lookup
  checked_at timestamptz not null default now()
);

create table if not exists ai_texts (
  key        text primary key,                -- sha256 of the request + prompt version + model
  model      text not null,
  result     jsonb not null,                  -- validated Gemini rewording
  created_at timestamptz not null default now()
);

-- Supabase exposes the public schema over its REST API with the public anon key.
-- RLS on + no policies = that API sees nothing. The BE connects as the table owner, which bypasses RLS.
alter table assessments enable row level security;
alter table dns_checks enable row level security;
alter table ai_texts enable row level security;
