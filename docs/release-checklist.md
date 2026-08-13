# Production release checklist

## Automated gate

- [ ] `npm run verify`
- [ ] `npm run test:e2e` on mobile and desktop Chromium projects
- [ ] Python Ruff, strict mypy, pytest, and OpenAPI drift check
- [ ] `supabase db reset` and `supabase test db`
- [ ] Edge command schema/auth tests
- [ ] RF-DETR TensorRT artifact checksum verified on T4
- [ ] TensorRT output smoke-compared with the same RF-DETR PyTorch weights

## Live camera matrix

- [ ] Chrome, Safari, Edge
- [ ] 390×844, 768×1024, 1440×900
- [ ] Bright, normal, low light
- [ ] Built-in and USB webcam where available
- [ ] Every object: 20 positive + 20 wrong-object trials
- [ ] Finger counts 1–5; left/right hand; extra person in frame
- [ ] Smile with glasses, mask, and multiple people
- [ ] Four colors against neutral and already-present baseline
- [ ] Camera denied, disconnected, tab hidden, slow/offline network
- [ ] Safe-area, keyboard, reduced-motion, HUD overlap, five-round screenshots

## Release thresholds

- [ ] Warm vision p95 ≤ 900 ms
- [ ] Object true-pass ≥ 90% within 3 seconds
- [ ] Finger/smile/color true-pass ≥ 95% within 2 seconds
- [ ] Wrong-target false-pass ≤ 1%
- [ ] Duplicate score/XP award = 0
- [ ] No camera frame in Supabase, Modal logs, Sentry event, or trace attachment
- [ ] No critical desktop/mobile UI overlap

## Promotion order

1. Staging Supabase migrations/RLS/seeds.
2. Staging Modal model artifact, deploy, warm/checksum smoke.
3. Contracts and integrations.
4. Vercel preview and complete game playtest.
5. Production Supabase migration.
6. Production Modal deploy and warm smoke.
7. Production Vercel deploy.
8. Observe system-error rate, p95, fallback rate, and cost/game before broad rollout.

Feature flags must start as:

```dotenv
NEXT_PUBLIC_VISION_ENABLED=true
GEMINI_FALLBACK_ENABLED=false
SEMANTIC_QUESTS_ENABLED=false
NEXT_PUBLIC_DEV_CONTROLS_ENABLED=false
```

`SEMANTIC_QUESTS_ENABLED` is reserved and must remain false in v1. If Modal errors spike, block new games without timing out active players. If Gemini errors spike, disable only the fallback.
