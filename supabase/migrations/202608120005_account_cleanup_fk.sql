-- A device owner owns both the durable profile and its historical match rows.
-- Cascading these profile references prevents auth-user deletion order from
-- leaving game rows that temporarily block profile cleanup.
alter table public.game_players
  drop constraint game_players_player_id_fkey,
  add constraint game_players_player_id_fkey
    foreign key (player_id) references public.player_profiles(id) on delete cascade;

alter table public.turns
  drop constraint turns_player_id_fkey,
  add constraint turns_player_id_fkey
    foreign key (player_id) references public.player_profiles(id) on delete cascade;
