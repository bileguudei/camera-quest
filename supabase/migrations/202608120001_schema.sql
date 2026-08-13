create extension if not exists pgcrypto with schema extensions;

create type public.quest_kind as enum ('object', 'fingers', 'smile', 'color');
create type public.quest_difficulty as enum ('easy', 'medium', 'hard');
create type public.game_status as enum ('active', 'completed', 'abandoned');
create type public.turn_status as enum ('prepared', 'active', 'passed', 'timed_out', 'aborted');
create type public.vision_decision as enum ('continue', 'pass', 'system_error');

create table public.player_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_slot smallint not null check (device_slot between 1 and 6),
  name text not null check (char_length(name) between 1 and 24),
  avatar text not null check (char_length(avatar) between 1 and 16),
  color text not null check (color in ('violet', 'blue', 'lime', 'orange', 'pink', 'cyan')),
  total_xp integer not null default 0 check (total_xp >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= current_streak),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (owner_id, device_slot)
);

create table public.games (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  status public.game_status not null default 'active',
  current_round smallint not null default 1 check (current_round between 1 and 5),
  rules_version text not null default 'production-v1',
  started_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create table public.game_players (
  id uuid primary key default extensions.gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id) on delete restrict,
  seat smallint not null check (seat between 1 and 6),
  match_score integer not null default 0 check (match_score >= 0),
  earned_xp integer not null default 0 check (earned_xp >= 0),
  successful_turns smallint not null default 0 check (successful_turns between 0 and 5),
  final_rank smallint check (final_rank between 1 and 6),
  unique (game_id, seat),
  unique (game_id, player_id)
);

create table public.quests (
  id uuid primary key,
  key text not null unique check (key ~ '^[a-z0-9_-]+$'),
  label text not null,
  prompt text not null,
  kind public.quest_kind not null,
  difficulty public.quest_difficulty not null,
  target_class text,
  finger_count smallint check (finger_count between 1 and 5),
  target_color text check (target_color in ('red', 'blue', 'green', 'yellow')),
  hex text,
  validator_config jsonb not null default '{}'::jsonb check (jsonb_typeof(validator_config) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  check (
    (kind = 'object' and target_class is not null)
    or (kind = 'fingers' and finger_count is not null)
    or (kind = 'color' and target_color is not null)
    or kind = 'smile'
  )
);

create table public.turns (
  id uuid primary key default extensions.gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  game_player_id uuid not null references public.game_players(id) on delete cascade,
  player_id uuid not null references public.player_profiles(id) on delete restrict,
  quest_id uuid not null references public.quests(id) on delete restrict,
  round smallint not null check (round between 1 and 5),
  status public.turn_status not null default 'prepared',
  prepared_at timestamptz not null default clock_timestamp(),
  started_at timestamptz,
  deadline_at timestamptz,
  resolved_at timestamptz,
  elapsed_ms integer check (elapsed_ms between 0 and 30000),
  points integer not null default 0 check (points >= 0),
  earned_xp integer not null default 0 check (earned_xp >= 0),
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  model_version text,
  validator_version text,
  vision_attempt_count integer not null default 0 check (vision_attempt_count >= 0),
  retry_count smallint not null default 0 check (retry_count between 0 and 1),
  created_at timestamptz not null default clock_timestamp(),
  check ((status in ('prepared', 'aborted')) or (started_at is not null and deadline_at is not null))
);

create unique index turns_one_open_turn_idx
  on public.turns (game_id, game_player_id, round)
  where status in ('prepared', 'active');

create table public.vision_attempts (
  id bigint generated always as identity primary key,
  turn_id uuid not null references public.turns(id) on delete cascade,
  sequence_no integer not null check (sequence_no > 0),
  latency_ms integer not null check (latency_ms >= 0),
  confidence real check (confidence between 0 and 1),
  validator text not null,
  decision public.vision_decision not null,
  reason text,
  created_at timestamptz not null default clock_timestamp(),
  unique (turn_id, sequence_no)
);

create table public.levels (
  level smallint primary key check (level between 1 and 50),
  minimum_xp integer not null unique check (minimum_xp >= 0)
);

create table public.achievements (
  id uuid primary key,
  key text not null unique,
  name text not null,
  description text not null,
  rule_key text not null unique,
  threshold integer not null check (threshold > 0),
  icon text not null
);

create table public.player_achievements (
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  unlocked_at timestamptz not null default clock_timestamp(),
  primary key (player_id, achievement_id)
);

create table public.player_quest_stats (
  player_id uuid not null references public.player_profiles(id) on delete cascade,
  quest_id uuid not null references public.quests(id) on delete cascade,
  successes integer not null default 0 check (successes >= 0),
  last_cleared_at timestamptz,
  primary key (player_id, quest_id)
);

create table public.turn_feedback (
  id bigint generated always as identity primary key,
  turn_id uuid not null references public.turns(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('false_positive', 'missed_target', 'slow', 'other')),
  created_at timestamptz not null default clock_timestamp(),
  unique (turn_id, owner_id)
);

create index player_profiles_owner_id_idx on public.player_profiles (owner_id);
create index games_owner_id_created_at_idx on public.games (owner_id, created_at desc);
create index game_players_player_id_idx on public.game_players (player_id);
create index turns_game_status_idx on public.turns (game_id, status);
create index turns_player_created_at_idx on public.turns (player_id, created_at desc);
create index turns_game_player_id_idx on public.turns (game_player_id);
create index turns_quest_id_idx on public.turns (quest_id);
create index vision_attempts_turn_created_at_idx on public.vision_attempts (turn_id, created_at);
create index player_achievements_achievement_id_idx on public.player_achievements (achievement_id);
create index player_quest_stats_quest_id_idx on public.player_quest_stats (quest_id);
create index turn_feedback_owner_id_idx on public.turn_feedback (owner_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create trigger player_profiles_set_updated_at
before update on public.player_profiles
for each row execute function public.set_updated_at();
