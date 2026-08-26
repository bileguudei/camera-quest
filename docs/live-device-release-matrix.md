# Live-device release matrix

This matrix is a blocking production gate. Run it against the exact Vercel
preview, Supabase migration set, and Modal revision that will be promoted.
Record the build URLs and tester in the release ticket; unchecked required rows
mean the release is not ready.

## Build evidence

| Field | Value |
| --- | --- |
| Git commit | |
| Vercel preview URL | |
| Supabase project + last migration | |
| Modal app/revision | |
| Tester + date | |

## Required devices

| Required | Device / browser | Camera | Network | Bright | Normal | Low light warning | Permission denied + retry | Mid-turn disconnect recovery | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Yes | Current iPhone / Safari | Rear + front | Wi-Fi | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Yes | Current Android / Chrome | Rear + front | Wi-Fi | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Yes | Older supported Android / Chrome | Rear | 4G/slow | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Yes | macOS / Chrome | Built-in | Wi-Fi | [ ] | [ ] | [ ] | [ ] | [ ] | |
| Yes | macOS / Safari | Built-in | Wi-Fi | [ ] | [ ] | [ ] | [ ] | [ ] | |
| If available | Windows / Edge | Built-in + USB | Wi-Fi | [ ] | [ ] | [ ] | [ ] | [ ] | |

## Online reliability scenarios

Use at least two real devices and keep both browser consoles free of uncaught
errors.

| Required scenario | Expected result | Pass |
| --- | --- | --- |
| Guest finishes preflight | Guest becomes ready automatically; there is no guest Start button | [ ] |
| Host presses Start once | Every connected phone enters the same round without another Start tap | [ ] |
| Host closes the tab for more than 15 seconds | Lowest connected seat becomes host and can continue/start | [ ] |
| Active player disconnects mid-turn | A spectator expires the turn after deadline + grace; pointer continues once | [ ] |
| ICE arrives before offer/answer settles | Live video connects or visibly stays on JPEG fallback; no black screen | [ ] |
| Watcher backgrounds for more than 6.5 seconds | Publisher expires it and stops unnecessary fallback work | [ ] |
| Everyone selects rematch | Exactly one new lobby/game id appears; scores reset; history remains unchanged | [ ] |
| One player selects New game | Their old membership is left and local setup opens | [ ] |
| Vision kill switch is disabled during a turn | Turn is aborted penalty-free and returns to handoff | [ ] |
| Network goes offline in lobby | Device becomes not-ready and host cannot start | [ ] |

## Recognition and privacy sample

For each environment, run every eligible object at least 20 positive and 20
wrong-object trials. Also verify smile (glasses/mask/multiple faces), all colors,
condition quests, and no camera frame in Supabase, Modal logs, Sentry events, or
trace attachments.

## Sign-off

- [ ] `npm run verify`
- [ ] `npm run test:e2e`
- [ ] Vision Ruff, strict mypy, pytest, OpenAPI drift
- [ ] Edge Function tests
- [ ] `supabase db reset` + pgTAP
- [ ] All required rows and scenarios above pass
- [ ] Product/engineering release owner approved the recorded evidence
