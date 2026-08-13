# Camera Quest Production v1

Нэг төхөөрөмж дээр 1–6 хүн ээлжилж, 5 раунд тоглох camera game. Оноо, XP, level, streak, achievement-ийг Supabase transaction тооцно; browser score өөрчлөх эрхгүй. Камерын frame зөвхөн Modal vision request-ийн хугацаанд memory-д байна — database, object storage, application log, Sentry-д хадгалахгүй.

Архитектур болон өргөтгөх заавар: [docs/architecture.md](docs/architecture.md). Release шалгуур: [docs/release-checklist.md](docs/release-checklist.md).

## Local frontend

Node.js 22+ ашиглана.

```bash
npm ci
npm run dev
```

Development server дээр environment өгөөгүй үед local repository болон fake vision adapter сонгогдоно. Production build environment дутуу бол fake game рүү шилжихгүй, game start хаагдана. Dev shortcut хэрэгтэй бол `.env.local`-д:

```dotenv
NEXT_PUBLIC_DEV_CONTROLS_ENABLED=true
```

Production-like frontend-д [.env.example](.env.example)-ийг загвар болгоно. `SUPABASE_SECRET_KEY`, Gemini key, calibration secret-ийг `NEXT_PUBLIC_*` хувьсагчид хэзээ ч хийж болохгүй.

## Local Supabase

Docker ажиллаж байх шаардлагатай.

```bash
supabase start
supabase db reset
supabase test db
deno test --allow-env supabase/functions/game-api/index_test.ts
supabase functions serve game-api --env-file supabase/.env.local
```

`supabase status`-ын local URL болон publishable key-г `.env.local`-ийн `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`-д хийнэ. Anonymous sign-in [supabase/config.toml](supabase/config.toml)-д идэвхтэй.

## Vision service

Production Modal image Python 3.11 ашигладаг. Core test suite GPU/model татахгүй.

```bash
cd vision-service
python3.11 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/ruff check app tests scripts
.venv/bin/mypy app tests scripts
.venv/bin/pytest
.venv/bin/python scripts/generate_openapi.py --check
```

Modal CLI-г тусад нь суулгаад secret үүсгэнэ. Secret-ийн key-үүд
[vision-service/.env.modal.example](vision-service/.env.modal.example)-д бий. Хувийн Modal
account-ыг солихгүйгээр team workspace profile болон тусгаарласан `staging`/`production`
environment үүсгэх бүрэн дарааллыг [Modal deployment runbook](docs/modal-deployment.md)-оос дагана.

```bash
python3.11 -m pip install 'modal>=1,<2'
modal token new --profile camera-quest-team --activate
modal run --env staging modal_app.py::build_tensorrt_artifact
modal deploy --env staging modal_app.py
```

`build_tensorrt_artifact` нь official RF-DETR-L pretrained weight-ээс T4-д зориулсан fixed-batch-5 FP16 engine үүсгэж, checksum manifest-тай Modal Volume-д хадгална. Production deploy-оос өмнө энэ command амжилттай дууссан байх ёстой.

Sentry заавал биш. `NEXT_PUBLIC_SENTRY_DSN` болон Modal secret-ийн `SENTRY_DSN` хоосон үед
frontend болон vision service event илгээхгүй; үндсэн game/vision flow өөрчлөгдөхгүй.

## Generated contracts

Generated file-ийг гараар засахгүй.

```bash
# FastAPI contract
cd vision-service
.venv/bin/python scripts/generate_openapi.py
cd ..
npm run generate:vision

# Local Supabase-аас (эсвэл project ref өгвөл linked project-оос) database type
npm run generate:database
SUPABASE_PROJECT_REF=your_project_ref npm run generate:database

npm run check:contracts
```

CI нь FastAPI → `openapi.json` → TypeScript client, мөн migrations → `database.types.ts` drift-ийг тус тус шалгана.

## Verification

```bash
npm run verify
npm run test:e2e
npm run test:python
```

`npm run test:supabase` болон `npm run test:edge` нь Docker/Deno суусан орчинд тусад нь ажиллана. Local environment-д Docker байхгүй бол Supabase reset/pgTAP-ийг CI эсвэл staging project дээр заавал ажиллуулна.

## Staging → production

1. Supabase project-оо Seoul (`ap-northeast-2`) region-д үүсгэж `supabase link --project-ref ...`, `supabase db push` ажиллуулна.
2. Edge secret `CORS_ALLOWED_ORIGINS`-г staging/production domain-аар тохируулаад `supabase functions deploy game-api --use-api` хийнэ. Opaque publishable key ашигладаг тул `verify_jwt=false`; function нь bearer access token-ийг `auth.getUser()`-аар шалгаж owner identity-г баталгаажуулна.
3. Modal staging secret үүсгэж TensorRT artifact build, checksum smoke, `modal deploy` хийнэ.
4. Vercel project environment-д browser-safe хувьсагчдыг тохируулж preview deploy дээр E2E/manual camera matrix ажиллуулна.
5. Release checklist ногоон бол production Supabase → Modal → Vercel дарааллаар гаргана.

Энэ repository deploy command-ыг автоматаар ажиллуулахгүй; production credential болон environment promotion нь хүний баталгаатай release алхам байна.
