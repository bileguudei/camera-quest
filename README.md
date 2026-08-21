# Camera Quest

Camera Quest бол нэг утас эсвэл компьютерийн камерыг ашиглан 1–6 хүн ээлжилж тоглодог web тоглоом.
Тоглогч бүр 5 раунд тоглоно. Нэг ээлж 30 секунд бөгөөд камерын өмнө даалгавраа биелүүлэхэд AI
таньж, оноо болон XP-г server талд бодно.

Жишээ даалгавар: **лонх ол**, **үүргэвч ол**, **инээмсэглэ**, **улаан зүйл ол**.

## Одоогийн төлөв (2026-08-21)

| Хэсэг                                              | Төлөв                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Тоглоомын UI, mobile responsive flow               | Бэлэн                                                                                             |
| 1–6 тоглогч, 5 раунд, 30 секундийн timer           | Бэлэн                                                                                             |
| Random quest, оноо, XP, level, streak, achievement | Бэлэн                                                                                             |
| Supabase database, RLS, Edge Function              | Hosted project дээр ажиллаж байгаа                                                                |
| Object, өнгө, smile танилт                         | Modal staging дээр ажиллаж байгаа                                                                 |
| Online lobby, ээлжийн live camera                  | WebRTC + adaptive JPEG fallback-тай                                                               |
| Vercel production URL, custom domain               | Хийгдээгүй; хамгийн сүүлд холбоно                                                                 |
| Production release gate                            | Бүрэн хаагдаагүй; live camera matrix үлдсэн                                                       |

Одоогийн даалгаврууд:

- Object: сургууль, гэр, гадаа гэсэн орчин тус бүрийн COCO object pool. Үүнд лонх, ном, үүргэвч,
  ширээ, аяга, laptop, буйдан, хөргөгч, машин, дугуй, автобус зэрэг орно.
- Өнгө: улаан, цэнхэр, ногоон, шар.
- Инээмсэглэл :0.

Object танилтад GPU дээр RF-DETR-L ONNX, инээмсэглэлд MediaPipe, өнгөнд OpenCV ашиглаж
байна. Browser дотор AI model ажиллахгүй. Gemini fallback болон semantic quest одоогоор унтраалттай.
Sentry заавал биш бөгөөд DSN өгөөгүй үед ажиллахгүй.

## Маш энгийн архитектур

```text
Browser (Next.js + camera)
        │
        ├── тоглоом, timer, score ──> Supabase Edge Function + Postgres
        │
        └── түр зуурын camera frame ──> Modal GPU vision service
```

- Browser оноо, XP-г өөрөө нэмэх эрхгүй. Supabase transaction эцсийн дүнг бодно.
- Camera frame зөвхөн таних request-ийн үед memory-д байна.
- Frame-ийг Supabase, Modal storage эсвэл application log-д хадгалахгүй.
- Нэг төхөөрөмж дээр anonymous device account үүсэж, нэртэй local player profile-ууд хадгалагдана.

## Clone хийгээд хамгийн хурдан ажиллуулах

### 1. Хэрэгтэй зүйлс

- [Git](https://git-scm.com/)
- [Node.js 22 LTS](https://nodejs.org/)
- Chrome browser
- Camera-тай утас эсвэл компьютер

Node суусан эсэхээ шалгах:

```bash
node -v
npm -v
```

`node -v` нь `v22...` гэж гарвал зөв.

### 2. Project-оо татах

```bash
git clone https://github.com/bileguudei/camera-quest.git
cd camera-quest
npm ci
```

### 3A. Зөвхөн UI болон тоглоомын flow шалгах

Cloud account, Supabase, Modal хэрэггүй. Project-ийн root дотор `.env.local` файл үүсгээд зөвхөн:

```dotenv
NEXT_PUBLIC_DEV_CONTROLS_ENABLED=true
```

Дараа нь:

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)-ийг Chrome-оор нээнэ. Энэ горим local development
adapter ашиглах тул жинхэнэ AI танихгүй. Тоглож байх үед зүүн талын dev товчоор `Success` эсвэл
`Timeout` өгч бүх screen flow-г шалгана.

### 3B. Багийн гишүүн чиний Supabase + Modal-тай ажиллуулах

Багийн гишүүнд Supabase эсвэл Modal account, CLI хэрэггүй. Clone хийсэн frontend нь чиний одоо
холбосон hosted Supabase болон Modal staging service-ийг шууд ашиглана.

`.env.local` нь security-ийн үүднээс Git-д ордоггүй учраас clone хийхэд автоматаар ирэхгүй. Project
owner өөрийн `.env.local`-ийг private team channel-аар явуулах эсвэл доорх утгуудыг өгнө:

- Supabase project URL
- Supabase **publishable** key
- Modal vision endpoint URL

Publishable key нь browser/mobile app-д ашиглах зориулалттай, RLS-ийг bypass хийдэггүй public key.
Харин Supabase secret/service-role key болон Modal token-ийг хэзээ ч явуулахгүй. Дэлгэрэнгүйг
[Supabase API key documentation](https://supabase.com/docs/guides/getting-started/api-keys)-оос харна.

Багийн гишүүн project-ийн root буюу `package.json`-тай нэг хавтаст `.env.local` үүсгэнэ:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://jfavjvcwdxspwibbdehc.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=OWNER_OOS_AVSAN_PUBLISHABLE_KEY
NEXT_PUBLIC_VISION_URL=https://ijilmurunnamkhaidorj-staging--camera-quest-vision-api.ap-south.modal.run
NEXT_PUBLIC_VISION_ENABLED=true
NEXT_PUBLIC_DEV_CONTROLS_ENABLED=false
NEXT_PUBLIC_SENTRY_DSN=
```

Дараа нь server-ээ дахин асаана:

```bash
npm run dev
```

Бүх компьютер дээр [http://localhost:3000](http://localhost:3000) origin ижил тул одоогийн CORS
тохиргоотой ажиллана. Өөр port сонгохгүй. Browser бүр Supabase anonymous device account-аа
автоматаар үүсгэх бөгөөд game/score/XP нь нэг hosted backend-д, тусдаа owner identity-гаар хадгалагдана.

Chrome дээр [http://localhost:3000](http://localhost:3000)-ийг нээгээд:

1. 1–6 тоглогчийн нэрийг оруулна.
2. Camera permission дээр `Allow` дарна.
3. `AI model бэлэн` болохыг хүлээнэ. Удаан ашиглаагүй үед cold start хэдэн секундээс удаан байж болно.
4. `Тоглоом эхлүүлэх` → тухайн тоглогч `Бэлэн` гэж дарна.
5. Calibration үед гараа/объектоо харуулахгүй, камераа тогтвортой барина.
6. Quest гарсны дараа хайж буй зүйл эсвэл гараа camera-ийн бүтэн хүрээнд тод харуулна.

> `SUPABASE_SECRET_KEY`, `service_role`, Modal token, Gemini key, calibration secret-ийг
> `.env.local`-ийн `NEXT_PUBLIC_*` хувьсагчид хэзээ ч хийж болохгүй.

## Түгээмэл асуудал

### Camera асахгүй байна

- Chrome → Site settings → Camera → `Allow` болгоно.
- Camera ашиглаж байгаа Zoom/Meet зэрэг app-ийг хаана.
- Page-ээ refresh хийнэ.
- Утаснаас local компьютер рүү IP address-аар орох үед camera HTTPS шаардаж болно. Эхний тестээ
  camera-тай компьютерийн `localhost:3000` дээр хийх нь хамгийн амар.

### `AI model ачаалж байна` дээр удаад байна

- Internet холболтоо шалгана.
- Modal GPU cold start хийж байж болно; Camera Check өөрөө дахин оролдоно.
- Browser console-ийн HTTP status болон Modal log-ийг шалгана.
- `NEXT_PUBLIC_VISION_URL` төгсгөлдөө илүү `/` эсвэл хуучин endpoint агуулаагүйг шалгана.

### Backend-тэй холбогдож чадсангүй

- `.env.local`-ийн Supabase URL болон publishable key хоёулаа зөв эсэхийг шалгана.
- Env өөрчилсний дараа `npm run dev`-ийг stop хийгээд дахин асаана.
- `service_role`/secret key-г browser-д ашиглахгүй.

## Developer setup

Энэ хэсэг нь database эсвэл AI backend өөрчлөх хүнд зориулагдсан. Зөвхөн frontend ажиллуулах бол
дээрх quick start хангалттай.

### Local Supabase

Нэмэлтээр Docker Desktop болон [Supabase CLI](https://supabase.com/docs/guides/local-development) хэрэгтэй.

```bash
supabase start
supabase db reset
supabase test db
deno test --allow-env --frozen supabase/functions/game-api/index_test.ts
supabase functions serve game-api --env-file supabase/.env.local
```

`supabase status`-ын local URL болон publishable key-г root `.env.local`-д хийнэ. Modal cloud нь
таны `localhost` Supabase руу шууд орж чадахгүй учраас жинхэнэ end-to-end AI тестэд hosted Supabase
project ашиглах нь хамгийн энгийн.

Hosted Supabase migration deploy:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase secrets set CORS_ALLOWED_ORIGINS=http://localhost:3000,https://YOUR_DOMAIN
supabase functions deploy game-api --use-api
```

### Vision service / Modal

Python service нь Python 3.11 ашиглана. Core test нь GPU model татахгүй.

```bash
cd vision-service
python3.11 -m venv .venv
.venv/bin/pip install -e '.[dev]'
.venv/bin/python -m ruff check app tests scripts modal_app.py
.venv/bin/python -m mypy app tests scripts
.venv/bin/python -m pytest
```

Team Modal workspace-д deploy хийхдээ:

```bash
python3.11 -m pip install 'modal>=1.4.3,<2'
modal token new --profile camera-quest-team --activate
cd vision-service
modal run --env staging modal_app.py::build_model_artifact
modal deploy --env staging modal_app.py
```

Secret-ийн нэр болон бүрэн setup-ийг [Modal deployment runbook](docs/modal-deployment.md)-оос харна.
RF-DETR-L TensorRT export parity gate даваагүй тул одоогийн serving path ONNX Runtime CUDA ашигладаг.

## Шалгах командууд

Frontend, TypeScript, unit test, generated contract, production build:

```bash
npm run verify
```

Нэмэлт test-үүд:

```bash
npm run test:e2e       # browser flow
npm run test:python    # Python validator/API
npm run test:supabase  # Docker ажиллаж байх ёстой
npm run test:edge      # Deno хэрэгтэй
```

## Folder бүтэц

```text
src/                    Next.js frontend, game/camera/vision feature-үүд
supabase/migrations/    Database schema, RLS, score/XP transaction
supabase/functions/     Authenticated game-api Edge Function
vision-service/app/     FastAPI, validators, security, model adapters
vision-service/tests/   Python test-үүд
e2e/                    Playwright browser test
docs/                   Architecture, Modal deploy, release checklist
```

Generated файлуудыг гараар засахгүй:

- `src/generated/database.types.ts`
- `src/generated/vision-api.ts`
- `vision-service/openapi.json`

## Production-д гаргахын өмнө

Одоогийн hosted Supabase болон Modal staging нь development/live camera test-д бэлэн. Харин custom
domain-тай Vercel production release хийхийн өмнө [release checklist](docs/release-checklist.md)-ийн
accuracy, false-pass, latency, privacy шалгууруудыг бодит төхөөрөмжүүд дээр бүрэн давсан байх ёстой.

Дэлгэрэнгүй:

- [Architecture ба шинэ quest/validator нэмэх заавар](docs/architecture.md)
- [Modal staging/production deployment](docs/modal-deployment.md)
- [Production release checklist](docs/release-checklist.md)

## Security санамж

- `.env.local`, `.env.modal.*`, token, secret key-г Git-д commit хийхгүй.
- `SUPABASE_SECRET_KEY` зөвхөн Edge/Modal server талд байна.
- Browser зөвхөн Supabase publishable key ашиглана.
- Production camera frame, screenshot, raw image хадгалахгүй.
