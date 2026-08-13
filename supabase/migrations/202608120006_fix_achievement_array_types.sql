create or replace function public.unlock_achievements(
  p_player_id uuid,
  p_game_id uuid,
  p_elapsed_ms integer
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_keys text[] := array[]::text[];
  v_streak integer;
  v_game_successes integer;
  v_color_successes integer;
  v_object_successes integer;
begin
  select current_streak into v_streak
  from public.player_profiles
  where id = p_player_id;

  select successful_turns into v_game_successes
  from public.game_players
  where game_id = p_game_id and player_id = p_player_id;

  select count(distinct q.target_color) into v_color_successes
  from public.player_quest_stats s
  join public.quests q on q.id = s.quest_id
  where s.player_id = p_player_id and s.successes > 0 and q.kind = 'color';

  select coalesce(sum(s.successes), 0) into v_object_successes
  from public.player_quest_stats s
  join public.quests q on q.id = s.quest_id
  where s.player_id = p_player_id and q.kind = 'object';

  insert into public.player_achievements (player_id, achievement_id)
  select p_player_id, a.id
  from public.achievements a
  where
    a.rule_key = 'first_clear'
    or (a.rule_key = 'quick_draw' and p_elapsed_ms < 5000)
    or (a.rule_key = 'on_fire' and v_streak >= 3)
    or (a.rule_key = 'unstoppable' and v_streak >= 10)
    or (a.rule_key = 'perfect_game' and v_game_successes >= 5)
    or (a.rule_key = 'rainbow' and v_color_successes >= 4)
    or (a.rule_key = 'object_hunter' and v_object_successes >= 25)
  on conflict do nothing;

  select coalesce(array_agg(a.key order by a.key), array[]::text[]) into v_keys
  from public.player_achievements pa
  join public.achievements a on a.id = pa.achievement_id
  where pa.player_id = p_player_id
    and pa.unlocked_at >= transaction_timestamp();

  return v_keys;
end;
$$;
