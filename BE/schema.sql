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
  expires_at   timestamptz,                   -- link stops working after this; null = never (demo rows)
  user_id      uuid references auth.users(id) -- who saved this, if signed in; null = anonymous share
);
alter table assessments add column if not exists expires_at timestamptz;
alter table assessments add column if not exists user_id uuid references auth.users(id);

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

-- Supplier Invites (MVP, step 1): a buyer invites a supplier to run their own check-up. No
-- supplier-facing screen or PIN verification yet — this is just the table, the create endpoint,
-- and the (stubbed) invite email. A submitted assessment reuses `assessments`, keyed by
-- child_assessment_id, so there is deliberately no second results table.
create table if not exists supplier_invites (
  id                   uuid primary key default gen_random_uuid(),
  token                text unique not null,          -- unguessable, secrets.token_urlsafe(16), same as share_token
  pin_hash             text not null,                 -- sha256 of a random 6-digit code; the code itself is never stored
  parent_assessment_id uuid not null references assessments(id),
  supplier_name        text not null,
  supplier_email       text not null,
  level                int not null check (level between 1 and 4),  -- 1 = direct supplier, +1 per hop down the chain
  status               text not null check (status in ('pending', 'submitted', 'filled_by_buyer', 'timed_out')) default 'pending',
  share_choice         text check (share_choice in ('score', 'report', 'both')),
  child_assessment_id  uuid references assessments(id),  -- set once the supplier submits
  deadline             timestamptz not null,
  created_at           timestamptz not null default now()
);

-- Supabase exposes the public schema over its REST API with the public anon key.
-- RLS on + no policies = that API sees nothing. The BE connects as the table owner, which bypasses RLS.
alter table assessments enable row level security;
alter table dns_checks enable row level security;
alter table ai_texts enable row level security;
alter table supplier_invites enable row level security;
