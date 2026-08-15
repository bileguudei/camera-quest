# Modal deployment runbook

Modal account эсвэл workspace credential repository-д хадгалагдахгүй. Нэг компьютер дээр
хувийн болон Camera Quest workspace-ийг зэрэг ашиглахдаа тусдаа CLI profile хэрэглэнэ.

Modal-ийн `staging` болон `production` environment нь ижил app, secret, volume нэрийг тусдаа
namespace-д хадгалдаг. Тиймээс `modal_app.py` дотор environment-specific нэр hard-code хийхгүй.

## 1. Workspace access болон local profile

Workspace owner Camera Quest-д ажиллах хэрэглэгчийг Modal workspace-ийн member болгоно. Дараа нь
тухайн workspace-ийг сонгосон browser session-аар profile үүсгэнэ:

```bash
python3.11 -m pip install 'modal>=1.4.3,<2'
modal token new --profile camera-quest-team --activate
modal profile current
modal token info
```

Owner API token өгсөн бол token-ийг command history-д бичихгүй. Interactive prompt ашиглана:

```bash
modal token set --profile camera-quest-team --activate
modal token info
```

`modal profile current` нь `camera-quest-team`, `modal token info` нь зөв workspace-ийг заасныг
баталгаажуулсны дараа л resource үүсгэнэ. Хувийн workspace руу буцахдаа
`modal profile activate <personal-profile>` ашиглана.

## 2. Isolated environments

Workspace дотор environment-үүдийг нэг удаа үүсгэнэ:

```bash
modal environment create staging
modal environment create production
modal environment list
```

Бүх deploy/run/secret command-д `--env`-ийг ил тод өгнө. Ингэснээр local default буруу байсан ч
production resource overwrite хийхгүй.

## 3. Secrets

`vision-service/.env.modal.example`-ийг secret агуулаагүй template болгон ашиглана:

```bash
cd vision-service
cp .env.modal.example .env.modal.staging
```

`.env.modal.staging` дотор staging Supabase server-side утгууд болон domain-уудыг оруулаад:

```bash
modal secret create --env staging camera-quest-vision-secrets \
  --from-dotenv .env.modal.staging
modal secret list --env staging
```

Production-д тусдаа `.env.modal.production` болон production Supabase key ашиглана. `SENTRY_DSN`
хоосон байж болно; service энэ үед Sentry-г эхлүүлэхгүй. Gemini fallback v1-ийн эхэнд false байна.

## 4. Staging artifact ба deploy

RF-DETR-L ONNX artifact-ийг target CUDA stack дээр build хийнэ. Volume нь `staging`
environment дотроо тусдаа үүснэ:

```bash
cd vision-service
modal run --env staging modal_app.py::build_model_artifact
modal deploy --env staging modal_app.py
```

Build command-ийн буцаасан `artifactSha256`, `runtime=onnxruntime-gpu`,
`onnxruntimeVersion=1.26.0`, `batchSize=5`, `shape=[512,512]` утгыг release log-д хадгална.
GPU ASGI container эхлэхдээ manifest/ONNX checksum болон `CUDAExecutionProvider` үнэхээр
идэвхтэй эсэхийг шалгана; CPU fallback-ийг зөвшөөрөхгүй. API, specialist validator, RF-DETR session
нэг container-т байрлах тул frame-ийг дахин JPEG encode хийх болон дотоод Modal GPU RPC байхгүй.

GPU ASGI API нь илүү найдвартай cold-start capacity бүхий өргөн `ap` compute region-д байрлаж,
public Modal ingress нь `ap-south` routing region ашиглана. GPU нь T4-ийг түрүүлж сонгоод capacity
дууссан үед L4 рүү fallback хийнэ. Narrow `ap-northeast` GPU pin нь staging дээр 45 секунд
schedule хүлээгээд warmup тасалсан тул дахин ашиглахгүй.

RF-DETR-L-ийн official TensorRT FP16 болон FP32 export нь T4 дээр PyTorch/ONNX reference-тэй
parity алдсан тул release gate-ээр хаагдсан. Serving path нь зөв output өгсөн ONNX Runtime CUDA-г
ашиглана. TensorRT-ийг зөвхөн ижил fixture дээр confidence/label parity давсны дараа буцаана.

Deploy дараа Modal dashboard-аас HTTPS endpoint-ийг авч Vercel preview environment-ийн
`NEXT_PUBLIC_VISION_URL`-д оруулна. `NEXT_PUBLIC_VISION_ENABLED=true` болгохоос өмнө `/health`,
authenticated `/v1/warmup`, calibration болон нэг active turn validation smoke test ажиллуулна.
Browser smoke нь `/v1/stream` WebSocket-оор authenticate хийж, хоёр дараалсан batch дээр нэг л
active-turn lookup ашиглаж байгааг мөн батална. HTTP `/v1/validate` нь rolling deploy/local tool-ийн
compatibility fallback хэвээр үлдэнэ.
`record_attempt_job` нь зураггүй telemetry metadata-г background queue-д бичнэ. Job retry бүр
`(turn_id, sequence_no)` unique key-тэй idempotent тул давхар attempt/score үүсгэхгүй; харин
`resolve_turn` background job биш бөгөөд оноог request дотор transaction-аар шийднэ.

Camera Check-ийн authenticated `/v1/warmup` нь GPU-г 30 секундийн turn эхлэхээс өмнө асаана.
`min_containers=0` үед шинэ GPU container-ийн cold start үлдэх учраас UI model бэлэн болтол start
button-ийг нээхгүй. Production-д instant first-game start заавал шаардвал measured traffic/cost дээр
үндэслэн GPU ASGI function-ийн `min_containers=1`-ийг тусдаа release change болгон идэвхжүүлнэ.

## 5. Production promotion

Staging camera matrix болон release thresholds тэнцсэний дараа ижил дарааллыг production
environment дээр давтана:

```bash
cd vision-service
modal secret create --env production camera-quest-vision-secrets \
  --from-dotenv .env.modal.production
modal run --env production modal_app.py::build_model_artifact
modal deploy --env production modal_app.py
```

Production secret-д production Supabase project, production Vercel origin, мөн
`ENVIRONMENT=production` байна. Staging endpoint-ийг production Vercel environment-д ашиглахгүй.

## 6. Safety checks

- Modal log, exception, trace-д multipart body эсвэл frame bytes бичихгүй.
- `SUPABASE_SECRET_KEY` болон `CALIBRATION_SIGNING_SECRET` browser/Vercel public env-д орохгүй.
- Secret файл, Modal token, model artifact repository-д commit хийхгүй.
- Deploy хийхийн өмнө active profile, workspace, `--env` гурвыг шалгана.
- Modal outage үед Supabase score өөрчлөгдөхгүй; идэвхтэй turn penalty-гүй abort/retry policy ашиглана.

Modal profile болон environment-ийн одоогийн CLI зан төлөвийг албан ёсны
[Workspaces](https://modal.com/docs/guide/workspaces),
[Environments](https://modal.com/docs/guide/environments),
[token](https://modal.com/docs/cli/latest/token),
[deploy](https://modal.com/docs/cli/latest/deploy),
[Secrets](https://modal.com/docs/guide/secrets) баримттай тулгасан.
