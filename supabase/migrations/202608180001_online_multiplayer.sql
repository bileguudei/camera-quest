-- Online lobbies: one host creates a game, up to six people join from their own
-- phones. Local hot-seat games keep working unchanged — there every seat still
-- belongs to the host's anonymous user, which is exactly what `mode` records.

create type public.game_mode as enum ('local', 'online');

alter table public.games
  add column mode public.game_mode not null default 'local',
  add column host_id uuid references auth.users(id) on delete cascade,
  add column join_code text check (join_code ~ '^[A-Z0-9]{6}$'),
  -- Seats can only be claimed before the host starts the match.
  add column lobby_open boolean not null default false,
  -- The authoritative turn pointer. The browser no longer decides whose turn it
  -- is; every phone reads this row and only the matching seat opens its camera.
  add column current_seat smallint not null default 1 check (current_seat between 1 and 6);

update public.games set host_id = owner_id;
alter table public.games alter column host_id set not null;

alter table public.games
  add constraint games_online_has_join_code
  check (mode = 'local' or join_code is not null);

create unique index games_join_code_idx
  on public.games (join_code)
  where join_code is not null;
create index games_host_id_created_at_idx on public.games (host_id, created_at desc);

alter table public.game_players
  -- The auth user sitting in this seat. In a local game that is the host for
  -- every seat; online it is the phone that claimed it.
  add column owner_id uuid references auth.users(id) on delete cascade,
  -- Denormalized from games.mode so the one-seat-per-user rule below can be a
  -- real index instead of a promise made by the RPC layer.
  add column mode public.game_mode not null default 'local',
  add column ready boolean not null default false,
  add column left_at timestamptz;

update public.game_players gp
set owner_id = g.owner_id
from public.games g
where g.id = gp.game_id;
alter table public.game_players alter column owner_id set not null;

create index game_players_game_owner_idx on public.game_players (game_id, owner_id);
create unique index game_players_online_one_seat_per_user_idx
  on public.game_players (game_id, owner_id)
  where mode = 'online';
