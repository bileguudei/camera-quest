-- Live spectating: the phone whose turn it is broadcasts a small preview of its
-- own camera to the table. Broadcast never touches score — it is presentation
-- only — but it does carry a camera image, so the channel must be private and
-- authorized per game, not merely hard to guess.

create function public.spectate_game_id(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic like 'spectate:%'
      and substring(p_topic from 10) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then substring(p_topic from 10)::uuid
  end;
$$;

revoke all on function public.spectate_game_id(text) from public, anon;
grant execute on function public.spectate_game_id(text) to authenticated;

-- Supabase authorizes private channels through RLS on realtime.messages.
-- `is_game_member(null)` is false, so any topic that is not a well-formed
-- spectate topic is rejected by the same expression.
create policy game_spectate_read on realtime.messages
for select to authenticated
using (
  extension = 'broadcast'
  and public.is_game_member(public.spectate_game_id(realtime.topic()))
);

create policy game_spectate_write on realtime.messages
for insert to authenticated
with check (
  extension = 'broadcast'
  and public.is_game_member(public.spectate_game_id(realtime.topic()))
);
