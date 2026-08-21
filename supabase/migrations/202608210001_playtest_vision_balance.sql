-- Playtest follow-up for recognition sensitivity.
--
-- Object scoring now uses two stable frames at the same confidence the player
-- can reasonably hold on a phone. One-frame detector noise still cannot score.
-- Colour keeps calibration, saturation and connected-region protection, but
-- halves the lens-filling area requirement.

update public.quests
set validator_config = validator_config || jsonb_build_object(
  'confidence', 0.55,
  'borderlineMin', 0.45,
  'consensus', 2
)
where kind = 'object';

update public.quests
set validator_config = validator_config || jsonb_build_object(
  'minArea', 0.025,
  'minRegionArea', 0.015,
  'saturation', case when target_color = 'red' then 0.36 else 0.30 end,
  'value', 0.18,
  'consensus', 3
)
where kind = 'color';
