# 11 — Checklist (single source of truth)

> Tất cả tasks gộp ở đây. Mỗi `[ ]` là 1 action grab-and-go: có file path, lib gợi ý, verify criteria, priority, effort.

**Ký hiệu:**
- `[x]` done — verify đã pass
- `[~]` partial — có một nửa, cần polish
- `[ ]` chưa code — kèm chi tiết để thực thi

**Priority:**
- 🔴 **P0** Blocking — pipeline không chạy/feature core thiếu nếu không có
- 🟠 **P1** Important — UX bị sứt mẻ, user thấy rõ
- 🟡 **P2** Nice-to-have — feature trong roadmap nhưng có thể chờ
- 🟢 **P3** Polish — improve nhỏ, không block ai

**Effort:** `S` ≤ nửa ngày · `M` 1-2 ngày · `L` 3-5 ngày · `XL` > 1 tuần

---

## 🎯 Quick wins — pick từ đây nếu chưa biết làm gì

5 items effort `S`, ROI cao, làm hôm nay được:

- [x] 🟠 **Drag-drop reorder ảnh trong frame** (S) — [F4](#f4--frame-library) · _2026-05-21 · sprint-quickwins_
- [x] 🟠 **Cancel job button** (S) — [F6](#f6--job-queue) · _2026-05-21_
- [x] 🟡 **Pagination cho jobs** (S) — [F6](#f6--job-queue) · _2026-05-21_
- [x] 🟠 **Auto-test API key sau khi add** (S) — [F5](#f5--api-keys) · _2026-05-21_
- [x] 🟢 **Bulk-upload nhiều ảnh** — đã có sẵn từ trước ([frames/page.tsx:58 `handleFiles`](../frontend/src/app/projects/[id]/frames/page.tsx) loop + `multiple` flag)
- [x] 🟠 **Telegram alert khi key fail** (S) — [F5](#f5--api-keys) · _2026-05-21 · thay thế bulk-upload_

---

## 🔴 P0 — Blocking (làm trước)

### Pipeline AI quality
- [x] Script: Gemini 2.5 Flash free hoạt động ([02_scene_generation.json](../video-content-engine/n8n_workflows/02_scene_generation.json))
- [x] Voice: Edge TTS free hoạt động (`edge-tts 7.2.8` installed in worker)
- [x] Image: **Gemini Flash Image** (`google/gemini-2.5-flash-image`) wired qua n8n `HTTP - Generate Scene Image` (GĐ G v5.2) — provider-agnostic, character DNA multimodal inject, query-auth. _Pending quota để verify ảnh thật._
- [x] Video: local slideshow OK; **Veo3 code wired** (GĐ H v5.2 — `veo3_generator.py` + Vertex AI SDK, image-to-video mode, semaphore 3 concurrent); **Ken Burns fallback** tự động khi Veo3 fail (GĐ I v5.2). `VIDEO_PROVIDER=veo3` ready — cần `secrets/gcp-sa.json`.
- [x] `masterVideoKey` được lưu DB qua webhook ([worker.controller.ts](../backend/src/webhooks/worker.controller.ts)) — verified 4/4 done videos
- [x] MinIO upload master video tự động sau ffmpeg — verified 8 master.mp4 trong bucket `assets/videos/`
- [x] Stale source auto-fail >15 phút ([source.service.ts](../backend/src/modules/source/source.service.ts) `markStaleAsFailed`)
- [x] **BGM step trong pipeline** — code ở [video_assembler.py:82-130](../video-content-engine/worker/video_assembler.py) (CompositeAudioClip mix voice + BGM với **random offset start để skip intro quiet section**) + [main_server.py:100 `_ensure_bgm`](../video-content-engine/worker/main_server.py) (3 providers: ElevenLabs Music/Suno/static URL fallback). Verified live: voice pause windows cải thiện +12 đến +19 dB sau offset fix (-51dB → -39dB, -48dB → -29dB), 8/8 windows audible. _2026-05-21_

- [x] **Decision: free vs paid Vertex AI** — **Chọn Free + polish** (Imagen requires paid Google AI upgrade tại `https://ai.dev/projects` — user chưa đăng ký). Polish action đã làm: BGM random offset skip intro (env: `BGM_INTRO_SKIP_SEC=20`, `BGM_OUTRO_SKIP_SEC=15`). Có thể upgrade sang Mixed/Full paid sau khi user bật billing trên Google AI Studio. _2026-05-21_

---

## F1 — Project workspace

### Done
- [x] CRUD project ([project.controller.ts](../backend/src/modules/project/project.controller.ts))
- [x] Auto-gen slug unique
- [x] Per-project niche/language/visualStyle/description
- [x] Per-project AI config 4 stages (script/refine/image/video)
- [x] Per-project voice config (provider/voiceId/speed/emotion/burnSubtitles)
- [x] Per-project `scriptBasePrompt` custom system prompt
- [x] Cascade delete

### Todo
- [ ] 🟡 **Duplicate project** (S)
  - File: `project.controller.ts` thêm `POST /projects/:id/duplicate`
  - Clone tất cả field ngoại trừ id/slug/createdAt
  - Verify: duplicate "My Channel" → "My Channel (copy)" với cùng config

- [ ] 🟡 **Export/import project config** (M)
  - File: thêm `GET /projects/:id/export` (JSON) + `POST /projects/import`
  - Verify: export → tải `.json` → import → project mới giống y hệt

- [ ] 🟡 **Project template library** (L)
  - File: thêm `frontend/src/app/projects/new/templates/` page
  - 3-5 preset: "Kể chuyện ma", "Lịch sử VN", "Tin tức", "Lifestyle"
  - Verify: chọn preset → niche/visualStyle/scriptBasePrompt auto-fill

---

## F2 — Tạo video

### Done
- [x] 4 input tabs YouTube/Báo/Truyện/Tự nhập ([create/page.tsx](../frontend/src/app/projects/[id]/create/page.tsx))
- [x] Validation per-tab + disclaimer YouTube/truyện
- [x] Cấu hình video bắt buộc: scenes/duration/aspect (block submit nếu thiếu)
- [x] Hint `≈ duration/scenes` giây mỗi scene
- [x] Draft persistence localStorage
- [x] Active source persistence (resume PipelineProgress)
- [x] AI + Voice + Character ref panel inline
- [x] Realtime PipelineProgress Socket.IO
- [x] **Provider-agnostic routing** (GĐ A v5.2) — BE resolve key+URL per provider, push `providers:{script,image,video}` xuống n8n; không hardcode
- [x] **Character library + DNA** (GĐ B v5.2) — character dropdown trong form, character_bible inject vào prompt + Gemini multimodal ref
- [x] **Voice script input** (GĐ C-D v5.2) — textarea optional; nếu trống → LLM sinh từ title+style
- [x] **Quality mode** (GĐ C v5.2) — Draft/Standard/Premium cap sceneCount + auto-clamp
- [x] **Cost estimate trước submit** (GĐ K v5.2) — live `💰 ~$X.XX` badge + ⚠️ badge khi > $3 + confirm dialog + BE pre-flight block
- [x] **Per-scene progress grid** (GĐ L v5.2) — N ô realtime queued/rendering/done/failed via Socket.IO, ETA live, click ô done → modal clip preview

### Todo
- [ ] 🟠 **Article URL fetch** (M)
  - File: `create/page.tsx` tab "Báo" hiện chỉ paste; thêm input URL + auto-fetch
  - Backend: `POST /sources/article-fetch { url }` dùng `@extractus/article-extractor`
  - Verify: paste VnExpress URL → script textarea tự fill nội dung bài báo

- [ ] 🟡 **Upload file `.docx` / `.pdf`** (M)
  - File: `create/page.tsx` tab Truyện
  - Lib: `mammoth.js` (docx), `pdfjs-dist` (pdf)
  - Verify: upload `.docx` 5 trang → script textarea có text

- [ ] 🟡 **Save preset cấu hình video** (M)
  - Schema: `CreateVideoPreset { projectId, name, sceneCount, durationSec, aspectRatio, voice, ai }`
  - File: `create/page.tsx` dropdown "Áp preset"
  - Verify: lưu "Short 9:16" → video sau chọn preset → form auto-fill

- [ ] 🟢 **Preview thumbnail trước submit** (L)
  - Trigger n8n thumbnail-only flow (không cần full pipeline)
  - Verify: bấm "Xem trước thumbnail" → hiện ảnh < 30s

---

## F3 — Quản lý video

### Done
- [x] List videos theo project ([videos/page.tsx](../frontend/src/app/projects/[id]/videos/page.tsx))
- [x] Detail page master player + scene grid ([videos/[vid]/page.tsx](../frontend/src/app/projects/[id]/videos/[vid]/page.tsx))
- [x] Status pill + cost display
- [x] Per-scene regenerate (`POST /scenes/:id/regenerate`)
- [x] Per-scene edit voiceover + prompt
- [x] Per-scene clips download (`GET /videos/:id/clips`)
- [x] Preview qua presigned MinIO URL
- [x] Cascade delete

### Todo
- [ ] 🟠 **Subtitle visual editor** (L) — design 1.4
  - File: thêm tab "Phụ đề" trong `videos/[vid]/page.tsx`
  - DB sẵn: `SubtitleLine` (startMs/endMs/text/position/style)
  - Lib: `wavesurfer.js` waveform + custom timeline drag handle
  - Backend: `PATCH /scenes/:id/subtitles` bulk update lines
  - Verify: drag handle → chỉnh ms → Re-render → mp4 sub đúng vị trí

- [ ] 🟠 **VideoTrimmer** (L) — design 2.2
  - File: modal `<VideoTrimmer>` mở từ video detail
  - Backend: `POST /videos/:id/trim { startSec, endSec }` → ffmpeg
  - Verify: trim 10s đầu → master mới ngắn hơn 10s

- [ ] 🟡 **FormatExportModal** (M) — design 2.3
  - Chọn output aspect ratio sau render (9:16/1:1/16:9)
  - Backend: ffmpeg crop+scale
  - Verify: từ master 16:9 → export 9:16 → file mới đúng tỉ lệ

- [ ] 🟡 **VideoCropTool** (L) — design 2.4
  - UI: kéo khung crop trên preview
  - Backend: ffmpeg crop theo coords
  - Verify: chọn vùng giữa → output chỉ chứa phần đó

- [ ] 🟡 **Re-order scenes** (M)
  - Schema: dùng `sceneIndex` (đã có)
  - Backend: `POST /videos/:id/scenes/reorder { newOrder: [sceneId,...] }`
  - FE: drag-drop với `@dnd-kit`
  - Verify: kéo scene 3 lên đầu → sceneIndex update → re-assemble

- [ ] 🟢 **Compare 2 versions của 1 scene** (M)
  - DB: thêm `SceneVersion` lưu key cũ
  - FE: side-by-side player
  - Verify: regenerate → modal "giữ bản nào", chọn → bản kia archive

---

## F4 — Frame library

### Done
- [x] CRUD frame ([frame.controller.ts](../backend/src/modules/frame/frame.controller.ts))
- [x] Upload nhiều ảnh
- [x] Backend reorder endpoint (`POST /frames/:id/reorder`)
- [x] Backend delete image
- [x] **Drag-drop reorder UI** — `@dnd-kit/core/sortable/utilities`, `SortableImage` component với grip indicator + optimistic update qua `qc.setQueryData`, touch-friendly `PointerSensor distance: 5`. _2026-05-21_
- [x] **Bulk-upload nhiều ảnh** — đã có sẵn: `<input multiple>` + `handleFiles` loop `Array.from(files)` từ trước

### Todo
- [ ] 🟡 **Tag/search ảnh** (M)
  - Schema: thêm `FrameImage.tags String[]`
  - FE: search box + tag chip
  - Verify: gắn tag "night" cho 3 ảnh → search "night" → ra 3 ảnh

---

## F5 — API Keys

### Done
- [x] Add key encrypted AES-256-GCM ([api-key.service.ts](../backend/src/modules/api-key/api-key.service.ts))
- [x] Auto-detect provider từ prefix (`AIza`/`sk-ant-`/`sk-`/`xi-`/`key_`)
- [x] Multi-capability per key
- [x] Toggle isActive + Delete
- [x] Test key chưa lưu (`POST /api-keys/test`)
- [x] Test key đã lưu + persist (`POST /api-keys/:id/test`)
- [x] "Test tất cả" button (de-dup)
- [x] HealthBadge OK/Quota/Hỏng/Chưa test
- [x] Relative time "Test gần nhất"
- [x] Rotation: `pickActive()` lấy key `quotaUsed` nhỏ nhất
- [x] Quota tracking + progress bar
- [x] Reset quota button
- [x] Internal endpoint `/api-keys/internal/active` (header `X-Internal-Secret`)
- [x] **Auto-test on add** — `create()` thành `async` + fire-and-forget `testStoredKey(created.id).catch(...)`; FE `add.onSuccess` schedule re-invalidate sau 5s để pick up HealthBadge. _2026-05-21_
- [x] **Telegram alert khi key fail** — `testStoredKey()` enqueue `notify` queue khi key ACTIVE và TRANSITION từ `ok` → bad (dedup: fresh dead key hoặc test lại dead key đã biết không spam). _2026-05-21_

### Todo
- [ ] 🟡 **Auto-test định kỳ (cron 24h)** (M)
  - File: thêm BullMQ repeatable hoặc Nest `@Cron`
  - Verify: log có "auto-tested N keys" mỗi sáng

- [ ] 🟡 **Cost tracking per provider** (M)
  - Schema: bổ sung `ApiKey.lastUsdSpent Float?`
  - Tích hợp với `CostLog` đã có
  - Verify: `/api-sources` hiện "Đã dùng $X tháng này" cho mỗi key paid

- [ ] 🟡 **Per-project quota override** (M)
  - `ApiKey.projectId` đã có (nullable) — đảm bảo `pickActive(capability, projectId)` ưu tiên project-scoped trước global
  - Verify: project A có key OpenAI riêng → render A dùng key A trước global

- [~] 🟡 **n8n auto-sync** (L) — workflow sync done, credential sync chưa
  - [x] **Workflow auto-import**: service `n8n_init` trong [docker-compose.yml](../docker-compose.yml) tự import + activate 3 workflow JSON khi volume `n8n_data` trống. Tester chỉ cần `docker compose up -d`, không cần vào n8n UI. Marker `/home/node/.n8n/.seeded` chống re-import.
  - [ ] **Credential auto-sync**: khi user add key tại `/api-sources` → tạo/update n8n credential qua n8n API. (Hiện workflow tự fetch key qua BE `/api-keys/internal/active` nên KHÔNG cần n8n credential — task này có thể đóng nếu không có use case khác.)

---

## F6 — Job queue

### Done
- [x] List jobs với filter (`GET /jobs` — queue/status/projectId/videoId)
- [x] ProjectGate wrap (bắt buộc chọn project)
- [x] Auto-refresh 5s
- [x] Mobile responsive (card-list)
- [x] Progress bar
- [x] Filter UI (queue + status)
- [x] Subquery `projectId` qua `video.projectId`
- [x] **Cancel job** — `DELETE /jobs/:id` + BullMQ `.remove()` (worker process đang chạy không bị kill — chỉ remove khỏi queue + mark DB `failed`); FE button ✕ trong row active/queued, cả mobile + desktop. _2026-05-21_
- [x] **Pagination** — `GET /jobs?limit=&offset=` trả `{items, total, limit, offset}` (clamp 1-200); FE footer "Trang X / Y", reset page khi đổi filter, auto-refresh 5s. _2026-05-21_

### Todo
- [ ] 🟡 **Retry failed job** (S)
  - File: `POST /jobs/:id/retry` — fetch payload cũ → enqueue lại
  - FE: button "Thử lại" row failed
  - Verify: job failed → retry → status `queued` mới, payload giữ nguyên

- [ ] 🟢 **Bulk delete jobs > N ngày** (S)
  - File: `DELETE /jobs/cleanup?olderThanDays=30`
  - Verify: chạy 1 lần → đếm rows giảm

---

## F7 — Notifications

### Done
- [x] In-app drawer ([NotificationDrawer.tsx](../frontend/src/components/layout/NotificationDrawer.tsx))
- [x] Telegram bot integration
- [x] Bot token + chat ID lưu DB (UI `/notifications/settings`)
- [x] Fallback env vars
- [x] `NotificationLog` per project + video
- [x] Auto-notify `video_complete`
- [x] Auto-notify pipeline error

### Todo
- [ ] 🟠 **Persist "Sự kiện gửi thông báo" checkboxes** (M)
  - File: [frontend/src/app/notifications/settings/page.tsx](../frontend/src/app/notifications/settings/page.tsx) — hiện UI-only không lưu
  - Schema: thêm `NotificationConfig { events: Json, logLevel: String }` per project hoặc global
  - Endpoint: `GET/PATCH /notifications/config`
  - Verify: tick event + save → reload → vẫn checked → trigger → có log

- [ ] 🟠 **Persist log level radio** (S) — cùng `NotificationConfig`
  - Verify: chọn "warning" → backend log filter level đúng

- [ ] 🟠 **Notification template editor** (M)
  - Hiện hiển thị placeholder, không edit được
  - Schema: `NotificationTemplate { event, template, variables }`
  - Verify: sửa "✅ {title} hoàn thành" → trigger → Telegram nhận đúng

- [ ] 🟡 **Email notification** (M)
  - File: `mailer.service.ts` dùng `nodemailer`
  - Schema: `NotificationConfig` support `channel: 'email'`
  - Verify: setup SMTP env → trigger → nhận email

- [ ] 🟡 **Discord webhook** (S)
  - File: `notification.service.ts` thêm channel `discord`
  - Verify: paste webhook URL → trigger → tin nhắn Discord

- [ ] 🟡 **Slack webhook** (S) — tương tự Discord

- [ ] 🟢 **Notification rules engine** (M)
  - Schema: `NotificationRule { event, channels, conditions }`
  - FE: `/notifications/rules` CRUD
  - Verify: rule "render failed AND duration > 5min → Telegram" → trigger đúng condition

- [ ] 🟢 **Quiet hours** (S)
  - Setting: `quietFrom/quietTo` per channel
  - Verify: gửi vào 23h → defer tới 8h sáng

---

## F8 — Theme + Responsive + UX polish

### Done
- [x] Dark theme default
- [x] Light theme overrides ([globals.css](../frontend/src/app/globals.css) — 22+ utilities)
- [x] Theme toggle persist localStorage
- [x] Sidebar responsive (mobile drawer)
- [x] TopBar responsive (hamburger)
- [x] Main padding `p-4 sm:p-5 md:p-6`
- [x] Jobs page card-list mobile
- [x] Api-sources rows wrap mobile
- [x] `sonner` toast setup ở layout (dùng rải rác)

### Todo
- [ ] 🟢 **Toast audit — đảm bảo mọi mutation có feedback** (S)
  - Scan các `useMutation` chưa có `onSuccess/onError` toast
  - Verify: mọi action CRUD có toast feedback

- [ ] 🟢 **Loading skeleton thay "Đang tải..."** (S)
  - Các page có `if (isLoading) return 'Đang tải...'` → shadcn `<Skeleton />`
  - Verify: refresh page → skeleton thay text trắng

- [ ] 🟢 **Full card-list api-sources mobile** (S)
  - File: `api-sources/page.tsx` — rows wrap nhưng vẫn dạng table; mobile nên thành card riêng
  - Verify: Chrome devtools mobile → mỗi key là 1 card đẹp

- [ ] 🟡 **PWA installable** (M)
  - Lib: `next-pwa` + `manifest.json`
  - Verify: Chrome → "Install app" hiện

- [ ] 🟢 **Touch swipe sidebar** (S)
  - Lib: `react-swipeable`
  - Verify: swipe trái-phải mobile → sidebar mở

---

## F9 — Pipeline reliability

### Done
- [x] Idempotent webhook (key by `episode_id`)
- [x] Stale source auto-fail >15 phút
- [x] BullMQ exponential backoff
- [x] HMAC support (env `WEBHOOK_HMAC_SECRET`)
- [x] Error propagation worker → BE → Socket.IO → FE

### Todo
- [ ] 🟡 **Dead-letter queue** (M)
  - Config BullMQ DLQ
  - FE: `/jobs?dlq=1` review
  - Verify: job fail 3 lần → xuất hiện trong DLQ

- [ ] 🟡 **Resume from checkpoint** (L)
  - Schema: `Scene.checkpointStage String?` (image_done/audio_done/...)
  - Worker: skip scene đã `done`
  - Verify: fail ở scene 4 → "Thử lại" → chỉ render 4-N không 1-3

- [ ] 🟡 **HMAC enforce production** (S)
  - Hiện `optional` — đổi guard `required` khi `NODE_ENV=production`
  - Verify: webhook không HMAC → 403

- [ ] 🟡 **Per-scene cost log granular** (M)
  - `CostLog` đã có — đảm bảo worker INSERT từng scene/operation
  - Verify: `SELECT * FROM cost_log WHERE videoId=X` ra ≥ scene_count rows

---

## F10 — Project binding

### Done
- [x] [useSelectedProject hook](../frontend/src/hooks/useSelectedProject.ts)
- [x] [ProjectGate component](../frontend/src/components/layout/ProjectGate.tsx)
- [x] TopBar amber dropdown khi chưa chọn
- [x] Sidebar ⚠️ icon
- [x] Auto-persist on URL navigate
- [x] Auto-clear khi project bị xoá

### Todo
- [ ] 🟢 **Recent projects trong TopBar dropdown** (S)
  - File: `TopBar.tsx` — track 5 last-accessed timestamps localStorage
  - Verify: visit 6 projects → dropdown hiện 5 mới nhất

- [ ] 🟡 **Cmd+K project switcher** (M)
  - Lib: `cmdk` (shadcn pattern)
  - Verify: Cmd+K → modal list projects + filter typeable

- [ ] 🟢 **Multi-project bulk operations** (XL)
  - VD: copy character refs A → B+C
  - Verify: chọn 3 project → "Copy chars" → 3 projects đều có

---

## F-Ops — Vận hành

### Done
- [x] Docker compose 1 command up
- [x] Prisma `migrate deploy` auto on start
- [x] MinIO bucket auto-init
- [x] Healthcheck Postgres/Redis/MinIO
- [x] `.env.example` đầy đủ
- [x] Logs structured NestJS

### Todo
- [ ] 🟡 **Prometheus `/metrics` endpoint** (M)
  - File: backend thêm route với `prom-client`
  - Verify: `curl /metrics` ra Prometheus format

- [ ] 🟡 **Grafana dashboard preset** (M)
  - File: `ops/grafana/dashboards/api-latency.json`
  - Verify: import vào Grafana → hiện metrics

- [ ] 🟡 **Auto-backup Postgres + MinIO** (M)
  - Cron container: `pg_dump` + `mc mirror`
  - Verify: log cron mỗi đêm, file backup tồn tại

- [ ] 🟡 **Migration rollback script** (S)
  - Mỗi migration thêm `down.sql`
  - Verify: `prisma migrate resolve --rolled-back` → schema rollback đúng

---

## Summary

| Priority | ✅ Done | 🔨 Todo |
|---|---|---|
| 🔴 P0 Blocking | **11** | **0** ✅ |
| 🟠 P1 Important | 10 | 7 |
| 🟡 P2 Nice-to-have | 2 | 22 |
| 🟢 P3 Polish | 1 | 10 |
| **Total** | **~99** | **~39** |

→ **Đề xuất order:**
1. ~~P0~~ — **CLOSED 2026-05-21** ✅ (Decision = Free + polish; BGM offset fix làm verify pass)
2. ~~Quick wins (5 items S)~~ — **xong hết 2026-05-21** ✅
3. ~~v5.2 features (A-L)~~ — **CLOSED 2026-06-10** ✅ (provider-agnostic, character DNA, quality mode, cost guard, per-scene grid; pending: image quota B.6/G.4, Veo3 H.6/L.6)
4. P1 todo (article-fetch, subtitle editor, video-trimmer, persist notification settings, ...)
5. P2/P3 theo nhu cầu

## Liên quan

- [10-product-spec.md](10-product-spec.md) — mô tả sản phẩm từ code
- [12-market-comparison.md](12-market-comparison.md) — feature gap so với competitors
- [08-roadmap.md](08-roadmap.md) — roadmap theo phase
- [07-ux-design.md](07-ux-design.md) — design spec đầy đủ
