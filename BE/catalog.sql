-- The check-up's content: questions, fixes, risks, standards, and wording. Applied on every startup
-- (idempotent). Rows are written only by app/catalog.py from the JSON files in app/catalog/, which stay
-- the source of truth: edit the files and redeploy, never the rows.
--
-- Its own schema, so Supabase's REST API (which exposes only "public") never serves it. RLS is on as well.
-- Per-sector and per-risk number maps (weights, base rates, modifiers) are jsonb: they are read whole
-- by the scoring engine and never queried by key.

create schema if not exists catalog;

create table if not exists catalog.meta (
  id         boolean primary key default true check (id),  -- single row
  version    text not null,                                -- sha256 of the source files
  loaded_at  timestamptz not null default now()
);

-- Framework references ---------------------------------------------------------------------------

create table if not exists catalog.frameworks (
  id      text primary key check (id in ('cccs', 'cis', 'ciosc')),
  source  text not null,
  url     text not null
);

create table if not exists catalog.cccs_controls (
  id                  text primary key,   -- e.g. BC.5
  position            int  not null,
  name                text not null,
  applies_if_profile  text,               -- the control applies only when this profile answer ...
  applies_if_in       text[]              -- ... is one of these (e.g. BC.11 needs a website)
);
alter table catalog.cccs_controls add column if not exists applies_if_profile text;
alter table catalog.cccs_controls add column if not exists applies_if_in text[];

create table if not exists catalog.cccs_requirements (
  id          text primary key,         -- e.g. BC.5.1
  control_id  text not null references catalog.cccs_controls(id),
  position    int  not null,
  summary     text not null
);

create table if not exists catalog.cis_controls (
  id     text primary key,              -- control number, e.g. 6
  title  text not null
);

create table if not exists catalog.cis_safeguards (
  id        text primary key,           -- e.g. 6.3
  position  int  not null,
  title     text not null,
  ig        smallint not null check (ig between 1 and 3)
);

create table if not exists catalog.ciosc_groups (
  id     text primary key,              -- e.g. 5
  title  text not null
);

create table if not exists catalog.ciosc_sections (
  id        text primary key,           -- e.g. 5.5
  position  int  not null,
  name      text not null,
  cccs      text[] not null,            -- CCCS controls covering the same ground
  questions text[],                     -- questions assessed directly where no CCCS control fits (6.6)
  note      text
);
alter table catalog.ciosc_sections add column if not exists questions text[];

create table if not exists catalog.report_templates (
  id          text primary key,
  position    int  not null,
  name        text not null,
  tagline     text not null,
  best_for    text not null,
  reports_on  text[] not null
);

-- Risks ------------------------------------------------------------------------------------------

create table if not exists catalog.scenarios (
  id           text primary key,        -- e.g. BEC
  position     int  not null,
  name         text not null,
  short        text not null,
  phrase       text not null,
  description  text not null,
  category     text not null,
  base         jsonb not null,          -- sector -> base likelihood
  chain        jsonb not null           -- "default" and optional sector -> steps
);

create table if not exists catalog.supply_impacts (
  id           text primary key,
  position     int  not null,
  label        text not null,
  description  text not null
);

create table if not exists catalog.supply_links (
  scenario_id  text not null references catalog.scenarios(id),
  impact_id    text not null references catalog.supply_impacts(id),
  position     int  not null,
  weight       double precision not null,
  primary key (scenario_id, impact_id)
);

-- Business profile -------------------------------------------------------------------------------

create table if not exists catalog.profile_questions (
  id        text primary key,
  position  int  not null,
  text      text not null,
  why       text not null
);

create table if not exists catalog.profile_options (
  question_id  text not null references catalog.profile_questions(id),
  value        text not null,
  position     int  not null,
  label        text not null,
  icon         text,
  primary key (question_id, value)
);

create table if not exists catalog.impact_rules (
  position   int  primary key,
  profile    text not null,             -- profile question id
  values_in  text[] not null,           -- the rule applies when the answer is one of these
  label      text not null,
  modifiers  jsonb not null             -- scenario -> impact modifier
);

-- Security questions -----------------------------------------------------------------------------

create table if not exists catalog.sections (
  id        text primary key,
  position  int  not null,
  title     text not null,
  intro     text not null
);

create table if not exists catalog.questions (
  id                text primary key,   -- e.g. Q1
  position          int  not null,
  section_id        text not null references catalog.sections(id),
  topic             text not null,
  text              text not null,
  why               text not null,
  gap_label         text not null,
  tech              text not null,
  weights           jsonb not null,     -- scenario -> weight
  impact_reduction  jsonb,              -- scenario -> reduction
  mapping_note      text,
  show_if_profile   text,               -- asked only when this profile answer ...
  show_if_in        text[],             -- ... is one of these
  auto_from         text,               -- filled in from the domain check (e.g. dmarc)
  check ((show_if_profile is null) = (show_if_in is null))
);

create table if not exists catalog.question_cccs (
  question_id  text not null references catalog.questions(id),
  control_id   text not null references catalog.cccs_controls(id),
  position     int  not null,
  reqs         text[] not null,
  strength     text not null check (strength in ('direct', 'partial')),
  primary key (question_id, position)   -- a control can appear twice, once per requirement strength (Q15 -> BC.7)
);

create table if not exists catalog.question_cis (
  question_id   text not null references catalog.questions(id),
  safeguard_id  text not null references catalog.cis_safeguards(id),
  position      int  not null,
  strength      text not null check (strength in ('direct', 'partial')),
  primary key (question_id, position)
);

-- Questionnaire cards ----------------------------------------------------------------------------

create table if not exists catalog.prompts (
  id         text primary key,          -- e.g. P6
  position   int  not null,
  section_id text not null references catalog.sections(id),
  type       text not null check (type in ('rows', 'ladder')),
  title      text not null,
  why        text not null,
  questions  text[]                     -- ladder only: the questions one choice sets
);

create table if not exists catalog.prompt_rows (
  prompt_id        text not null references catalog.prompts(id),
  question_id      text not null references catalog.questions(id),
  position         int  not null,
  label            text not null,
  label_basic      text,
  label_by_sector  jsonb,               -- sector -> label
  label_when       jsonb,               -- [{profile, in, label}], wording for a profile answer
  options          jsonb not null,      -- [{value, label}]
  na               text,                -- label for "does not apply"
  primary key (prompt_id, question_id)
);
alter table catalog.prompt_rows add column if not exists label_when jsonb;

create table if not exists catalog.ladder_options (
  prompt_id  text not null references catalog.prompts(id),
  position   int  not null,
  label      text not null,
  sets       jsonb not null,            -- question -> answer
  primary key (prompt_id, position)
);

-- Fixes ------------------------------------------------------------------------------------------

create table if not exists catalog.actions (
  id                 text primary key,  -- e.g. A1
  position           int  not null,
  title              text not null,
  what_to_do         text not null,
  why                text not null,
  steps              text[] not null,
  steps_by_provider  jsonb,             -- email provider -> steps
  cost               text not null,
  time               text not null,
  effort             smallint not null
);

create table if not exists catalog.action_questions (
  action_id    text not null references catalog.actions(id),
  question_id  text not null references catalog.questions(id),
  position     int  not null,
  primary key (action_id, question_id)
);

create table if not exists catalog.rule_signs (
  action_id    text primary key references catalog.actions(id),
  position     int  not null,
  title        text not null,
  lead         text not null,
  must         text[] not null,
  approvers    text[],
  warnings     text[],
  contacts     jsonb,                   -- [{role, phone}]
  log_title    text,
  log_columns  text[]
);

-- Singletons -------------------------------------------------------------------------------------

create table if not exists catalog.settings (
  key    text primary key check (key in ('impact', 'ranking', 'promptIntro')),
  value  jsonb not null
);

do $$
declare t text;
begin
  foreach t in array array[
    'meta', 'frameworks', 'cccs_controls', 'cccs_requirements', 'cis_controls', 'cis_safeguards', 'ciosc_groups',
    'ciosc_sections', 'report_templates', 'scenarios', 'supply_impacts', 'supply_links', 'profile_questions',
    'profile_options', 'impact_rules', 'sections', 'questions', 'question_cccs', 'question_cis', 'prompts',
    'prompt_rows', 'ladder_options', 'actions', 'action_questions', 'rule_signs', 'settings'
  ] loop
    execute format('alter table catalog.%I enable row level security', t);
  end loop;
end $$;
