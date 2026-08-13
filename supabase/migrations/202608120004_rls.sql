alter table public.player_profiles enable row level security;
alter table public.games enable row level security;
alter table public.game_players enable row level security;
alter table public.quests enable row level security;
alter table public.turns enable row level security;
alter table public.vision_attempts enable row level security;
alter table public.levels enable row level security;
alter table public.achievements enable row level security;
alter table public.player_achievements enable row level security;
alter table public.player_quest_stats enable row level security;
alter table public.turn_feedback enable row level security;

create policy player_profiles_owner_select on public.player_profiles
for select to authenticated using (owner_id = (select auth.uid()));

create policy games_owner_select on public.games
for select to authenticated using (owner_id = (select auth.uid()));

create policy game_players_owner_select on public.game_players
for select to authenticated using (
  exists (
    select 1 from public.games g
    where g.id = game_players.game_id and g.owner_id = (select auth.uid())
  )
);

create policy quests_authenticated_select on public.quests
for select to authenticated using (active);

create policy turns_owner_select on public.turns
for select to authenticated using (
  exists (
    select 1 from public.games g
    where g.id = turns.game_id and g.owner_id = (select auth.uid())
  )
);

create policy vision_attempts_owner_select on public.vision_attempts
for select to authenticated using (
  exists (
    select 1
    from public.turns t join public.games g on g.id = t.game_id
    where t.id = vision_attempts.turn_id and g.owner_id = (select auth.uid())
  )
);

create policy levels_authenticated_select on public.levels
for select to authenticated using (true);

create policy achievements_authenticated_select on public.achievements
for select to authenticated using (true);

create policy player_achievements_owner_select on public.player_achievements
for select to authenticated using (
  exists (
    select 1 from public.player_profiles p
    where p.id = player_achievements.player_id and p.owner_id = (select auth.uid())
  )
);

create policy player_quest_stats_owner_select on public.player_quest_stats
for select to authenticated using (
  exists (
    select 1 from public.player_profiles p
    where p.id = player_quest_stats.player_id and p.owner_id = (select auth.uid())
  )
);

create policy turn_feedback_owner_select on public.turn_feedback
for select to authenticated using (owner_id = (select auth.uid()));

create policy turn_feedback_owner_insert on public.turn_feedback
for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and exists (
    select 1 from public.turns t join public.games g on g.id = t.game_id
    where t.id = turn_feedback.turn_id and g.owner_id = (select auth.uid())
  )
);

revoke all on all tables in schema public from anon;
revoke insert, update, delete on all tables in schema public from authenticated;
grant select on public.player_profiles, public.games, public.game_players, public.quests,
  public.turns, public.vision_attempts, public.levels, public.achievements,
  public.player_achievements, public.player_quest_stats, public.turn_feedback to authenticated;
grant insert on public.turn_feedback to authenticated;
grant usage, select on sequence public.turn_feedback_id_seq to authenticated;
