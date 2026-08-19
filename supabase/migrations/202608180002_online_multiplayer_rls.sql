-- Reads move from "the host owns the row" to "you sit at this table". Writes are
-- unchanged: still RPC-only, so nothing here grants insert/update/delete.

-- security definer breaks the RLS recursion that a plain subquery on
-- game_players inside game_players' own policy would cause.
create function public.is_game_member(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_players gp
    where gp.game_id = p_game_id
      and gp.owner_id = (select auth.uid())
      and gp.left_at is null
  );
$$;

revoke all on function public.is_game_member(uuid) from public, anon;
grant execute on function public.is_game_member(uuid) to authenticated;

drop policy games_owner_select on public.games;
create policy games_member_select on public.games
for select to authenticated using (public.is_game_member(id));

drop policy game_players_owner_select on public.game_players;
create policy game_players_member_select on public.game_players
for select to authenticated using (public.is_game_member(game_id));

drop policy turns_owner_select on public.turns;
create policy turns_member_select on public.turns
for select to authenticated using (public.is_game_member(game_id));

drop policy vision_attempts_owner_select on public.vision_attempts;
create policy vision_attempts_member_select on public.vision_attempts
for select to authenticated using (
  exists (
    select 1 from public.turns t
    where t.id = vision_attempts.turn_id and public.is_game_member(t.game_id)
  )
);

-- A scoreboard has to render the other phones' names, avatars and streaks.
drop policy player_profiles_owner_select on public.player_profiles;
create policy player_profiles_member_select on public.player_profiles
for select to authenticated using (
  owner_id = (select auth.uid())
  or exists (
    select 1 from public.game_players gp
    where gp.player_id = player_profiles.id and public.is_game_member(gp.game_id)
  )
);

drop policy turn_feedback_owner_insert on public.turn_feedback;
create policy turn_feedback_member_insert on public.turn_feedback
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.turns t
    where t.id = turn_feedback.turn_id and public.is_game_member(t.game_id)
  )
);

-- Realtime fan-out. Every phone follows its own game through these three tables;
-- RLS above is what keeps one lobby from reading another.
-- Idempotent: a table may already have been published from the dashboard.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['games', 'game_players', 'turns'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
