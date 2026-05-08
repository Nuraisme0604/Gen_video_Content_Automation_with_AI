# Plan — Hoàn thiện AI Video Tool tới mức Production

> Mục tiêu: đưa repo này lên ngang hàng các SaaS tương đương (Pictory, InVideo, Vbee) cho thị trường VN — tập trung vào **reliability + chất lượng output + editor cơ bản**, không build lại kiến trúc.
> Định vị thực tế: text-to-video tiếng Việt với pipeline tự động hoá + editor nhẹ. KHÔNG cố làm Synthesia (avatar) hay Runway (creative pro).

---

## 0. Snapshot hiện tại (2026-05-08)

### Đang chạy ổn
- Stack 7 services Docker compose up, healthy
- Pipeline E2E: FE → BE → n8n → Python worker → MinIO → FE preview
- Multi-scene rendering (đã fix bug 1-scene)
- Sidebar nhớ project qua localStorage; project switcher giữ sub-path
- 27/33 nút FE wired (Sprint 1+2 đã fix 6 nút broken)
- API key UX: auto-detect provider, multi-capability checkbox
- Notification settings persist localStorage
- Edge TTS Vietnamese (vi-VN-NamMinhNeural) cho voiceover

### Fallback (chất lượng dưới chuẩn market)
- Image: `picsum.photos` placeholder thay vì Imagen 4 (chờ paid plan)
- Video: ffmpeg Ken Burns slideshow thay vì Veo3 (chờ paid plan)
- BGM: chưa có (ElevenLabs Music $22/tháng)
- Voice: 1 giọng duy nhất (Edge TTS không cho clone)

### Còn thiếu hoàn toàn
- Editor: SubtitleEditor, VideoTrimmer, VideoCropTool, FormatExportModal
- Multi-key rotation khi quota hết
- Backend → n8n credential auto-sync
- Toast notification (UX feedback)
- Frame drag-drop reorder, upload từ file
- Auth (single-user dev only)
- Monitoring / structured logging / metrics

---

## Phase 1 — Reliability (1 tuần, không phụ thuộc paid plan)

Mục tiêu: tool không vỡ khi quota hết, lỗi rõ ràng, retry thông minh.

### 1.1 Multi-key rotation
- File: [backend/src/modules/source/api-key.service.ts](backend/src/modules/source/api-key.service.ts) — thêm `pickActiveKey(capability)` chọn key có `isActive=true`, sort theo `lastUsedAt asc`, fallback nếu key đầu trả `429/quota_exceeded`
- File: [backend/src/modules/job/render.processor.ts] — wrap fetch call, on 429 → mark key `isActive=false`, retry với key kế tiếp
- DB: thêm `ApiKey.lastErrorAt`, `ApiKey.errorCount` (Prisma migration)
- Verify: nhập 2 key Gemini, force key 1 expired, render → tự fallback sang key 2, log rõ "switched key abc → def"

### 1.2 Worker → Backend webhook đáng tin cậy
- File: [video-content-engine/worker/main_server.py](video-content-engine/worker/main_server.py) — đảm bảo `POST /webhooks/worker/render-complete` được gọi với `masterVideoKey`, có retry 3 lần (HMAC signed)
- File: [backend/src/webhooks/worker.controller.ts] — verify HMAC, update `Video.masterVideoKey + status=published`, broadcast Socket.IO `video:complete`
- Verify: tạo video → DB `videos.masterVideoKey` không null sau khi pipeline xong → FE preview play được không cần refresh

### 1.3 Cấu trúc lỗi user-facing
- File: [backend/src/common/filters/http-exception.filter.ts] — chuẩn hoá error response `{code, userMessage, details}` (vd `QUOTA_EXCEEDED`, `INVALID_KEY`, `RENDER_TIMEOUT`)
- File: [frontend/src/lib/api.ts] — interceptor parse error code → toast (sau khi có toast ở 4.2)
- Verify: API key sai → FE thấy "Key không hợp lệ. Kiểm tra prefix AIza/sk-/xi-" thay vì "500 Internal Server Error"

### 1.4 Logging cấu trúc cho debug
- File: [video-content-engine/worker/main_server.py] — replace `print` bằng `logger` với context `{video_id, scene_id, stage}`
- File: [backend/src/main.ts] — pino logger với request ID
- Verify: `docker compose logs python_worker | grep <video_id>` show full pipeline timeline

---

## Phase 2 — Editor cơ bản (2 tuần, P0 cho "ngang market tool")

Đây là phần market tool nào cũng có; thiếu = công cụ "demo" chứ không phải "tool dùng được".

### 2.1 SubtitleEditor (Module 1.4 design.md)
- File mới: [frontend/src/components/video/SubtitleEditor.tsx]
  - Render `.srt` cues thành list, mỗi cue: `start | end | textarea`
  - Auto-save debounce 1s → `PATCH /api/v1/scenes/:id/subtitle`
- BE endpoint: [backend/src/modules/scene/scene.controller.ts] thêm `PATCH /:id/subtitle` (body `{cues: [{start, end, text}]}`)
- Worker: re-burn subtitle khi cue thay đổi → trigger `subtitle-rerender` job
- Verify: edit "Mèo ở Hà Nội" → "Mèo ở Sài Gòn" → re-render scene → video update sub

### 2.2 VideoTrimmer (Module 2.2)
- File mới: [frontend/src/components/video/VideoTrimmer.tsx]
  - Two-handle slider trên `<video>` element + ffmpeg.wasm cho preview client-side
  - Submit `POST /api/v1/videos/:id/trim` body `{startSec, endSec}`
- BE → enqueue `trim` job → worker chạy `ffmpeg -ss X -to Y -c copy`
- Verify: video 32s trim 5s-25s → master mới 20s, preview FE update

### 2.3 VideoCropTool (Module 2.4) + FormatExportModal (2.3)
- File mới: [frontend/src/components/video/FormatExportModal.tsx]
  - 3 preset: YouTube (16:9 1920x1080), TikTok/Reels (9:16 1080x1920), Square (1:1 1080x1080)
  - Mỗi preset gọi `POST /api/v1/videos/:id/export` body `{format, crop}`
- BE → worker chạy `ffmpeg -vf "scale=...,crop=..."` → upload thêm `videos/:id/export-9x16.mp4` v.v.
- DB: model `VideoExport {id, videoId, format, s3Key, status}`
- Verify: 1 video → click "Export TikTok" → 30-60s sau có file 9:16 download được

### 2.4 Frame drag-drop reorder + upload từ file
- File: [frontend/src/app/projects/[id]/frames/page.tsx] — wire `@dnd-kit/sortable`, on drop → `PATCH /api/v1/frames/reorder` body `{orderedIds: []}`
- BE: endpoint reorder đã có (per CHECKLIST P3) — chỉ wire FE
- Upload file: BE thêm `POST /api/v1/frames` (multipart) → upload MinIO bucket `assets` → trả presigned URL
- Verify: kéo frame 3 lên đầu → save → reload thấy thứ tự mới; upload PNG → frame xuất hiện

---

## Phase 3 — Asset Quality (conditional 1-2 tuần)

Phần này blocking trên user upgrade paid plan. Trong khi chờ → tối ưu fallback path.

### 3.1 Real Veo3 + Imagen (KHI có paid plan)
- File: [.env] — `VIDEO_PROVIDER=veo3`, `OPENAI_IMAGE_MODEL=imagen-4-fast`
- File: [video-content-engine/worker/veo3_generator.py] — đã có code, test lại với key paid
- Verify: render 1 scene → MP4 thật từ Veo3 (8s animation) thay vì slideshow

### 3.2 Stock footage fallback (KHÔNG paid plan, công sức 2-3 ngày)
Thay vì slideshow Ken Burns đơn điệu → search Pexels Video API với keyword từ scene.
- File mới: [video-content-engine/worker/pexels_client.py] — `search_video(query, duration) → mp4_url`
- File: [video-content-engine/worker/asset_downloader.py] — thêm provider `pexels`: nếu không có Veo3 key → search Pexels theo `video_prompt` keyword Vietnamese-translated, download MP4, trim đúng duration
- Verify: prompt "mèo ở Hà Nội" → Pexels trả video B-roll mèo + Hà Nội → ghép tạo cảm giác chuyên nghiệp hơn slideshow

### 3.3 BGM library + auto-mix (3-4 ngày)
- Curate ~20 track public domain (Free Music Archive, Pixabay) commit vào `video-content-engine/assets/bgm/`
- Worker: [video-content-engine/worker/video_assembler.py] — sau khi assemble master, mix BGM ở -18dB dưới voice (`ffmpeg -filter_complex "[1:a]volume=0.15[bg];[0:a][bg]amix=duration=shortest"`)
- FE: dropdown chọn BGM trong [frontend/src/components/video/AiConfigPanel.tsx]
- Verify: render → master có BGM mood matching, voice rõ trên BGM

### 3.4 Voice variety
- File: [frontend/src/components/video/VoiceConfigPanel.tsx] — dropdown 5 giọng Edge TTS:
  - vi-VN-NamMinhNeural (nam trẻ)
  - vi-VN-HoaiMyNeural (nữ trẻ)
  - vi-VN-LanNeural (legacy)
  - en-US-AriaNeural (English nữ)
  - en-US-GuyNeural (English nam)
- Lưu vào `Project.voiceConfig` JSON field
- Verify: đổi giọng → render scene → audio dùng giọng mới

---

## Phase 4 — UX Polish (1 tuần, không blocking)

### 4.1 Backend → n8n credential auto-sync
- File: [backend/src/modules/source/n8n-sync.service.ts]
  - Khi user POST key vào `/api/v1/api-sources` → call n8n REST `POST /api/v1/credentials` tạo credential `googleAi-<keyId>`
  - Update `ApiKey.n8nCredentialId` trong DB
- File: [video-content-engine/n8n_workflows/02_scene_generation.json] — node HTTP đổi credential ref sang dynamic `={{ $('Get Credential').first().json.id }}`
- Verify: thêm key mới qua FE → check n8n UI → credential xuất hiện auto

### 4.2 Toast notification
- Lib: `sonner` (đã có shadcn integration)
- File: [frontend/src/app/layout.tsx] — `<Toaster />` global
- File: [frontend/src/lib/api.ts] — interceptor: success → `toast.success`, error → `toast.error(err.userMessage)`
- Verify: tạo project → toast "Đã tạo dự án"; key invalid → toast "Key không hợp lệ"

### 4.3 Loading skeleton (replace "Đang tải...")
- File mới: [frontend/src/components/ui/skeleton.tsx] (shadcn)
- Replace "Đang tải..." trong: `projects/page.tsx`, `videos/page.tsx`, `jobs/page.tsx`, `frames/page.tsx`
- Verify: refresh page → skeleton 200ms → data appear, không thấy chữ "Đang tải"

### 4.4 Pipeline progress chi tiết hơn
- File: [frontend/src/components/video/PipelineProgress.tsx] — hiện có 5-stage timeline; bổ sung:
  - Per-scene progress bar (4 scene = 4 row con dưới mỗi stage)
  - ETA hiện tại còn lại (dựa trên avg time/stage từ historical data)
- Worker: emit `job:progress` với `{sceneIndex, stagePct}` mịn hơn
- Verify: render 4-scene video → thấy "Scene 2/4: rendering image (60%)..."

---

## Phase 5 — Production Hardening (1-2 tuần, làm sau khi tool đã usable)

### 5.1 Authentication tối thiểu
- Approach: NextAuth + Postgres adapter, single email/password (admin) + JWT cookie
- File mới: [backend/src/modules/auth/], [frontend/src/app/(auth)/login/page.tsx]
- Middleware bảo vệ tất cả `/api/v1/*` trừ `/auth/*`
- Verify: logout → mọi page redirect /login; không xem được video người khác (nếu sau có multi-user)

### 5.2 Structured monitoring
- Add: Sentry (FE + BE), Prometheus metrics endpoint trên BE + worker
- Dashboard: Grafana với graph render-time-p95, queue-depth, key-quota-remaining
- Verify: gây lỗi 500 → Sentry alert; quota Gemini < 10% → metrics warn

### 5.3 Backup
- Cron daily: `pg_dump` → MinIO bucket `backups/`, MinIO `mc mirror` → external S3 (nếu có)
- Retention: 7 ngày daily + 4 tuần weekly
- Verify: tạo video, drop DB, restore từ backup → video record vẫn còn

### 5.4 Rate limit BE-side
- File: [backend/src/main.ts] — `@nestjs/throttler` 60req/min/IP
- Verify: spam 100req → trả 429

---

## Risks & Tradeoffs

| Risk | Impact | Mitigation |
|---|---|---|
| User không upgrade paid plan | Output quality kém vs market | Phase 3.2 (Pexels stock) làm slideshow trông pro hơn |
| Edge TTS giọng máy | UX kém vs voice clone | Phase 3.4 thêm 5 giọng + cho upgrade ElevenLabs sau |
| ffmpeg.wasm trim chậm trong browser | UX trim lag | Trim làm BE-side, FE chỉ preview slider |
| n8n credential sync vỡ khi xoay key | Pipeline đứng | Phase 1.1 multi-key + Phase 4.1 sync chạy đồng bộ |
| Phase 5 auth làm break dev workflow | Mất tốc độ | Feature flag `AUTH_DISABLED=true` cho dev mode |
| Storage MinIO single-host fill đầy | Renders fail | Cron clean videos > 30 ngày, alert disk > 80% |

---

## Đề xuất thứ tự thực thi

| Tuần | Phase | Output đo lường được |
|---|---|---|
| 1 | 1.1 + 1.2 + 1.3 | Render fail-safe khi quota hết, error message rõ |
| 2 | 2.1 + 2.4 | SubtitleEditor + Frame upload+reorder dùng được |
| 3 | 2.2 + 2.3 | Trim + Export 3 format hoàn chỉnh |
| 4 | 3.2 + 3.3 + 3.4 | Pexels stock + BGM + 5 voice — output đạt chuẩn social |
| 5 | 4.1 + 4.2 + 4.3 | UX polish — toast, skeleton, n8n sync |
| 6 | 4.4 + 1.4 | Pipeline progress chi tiết + structured logging |
| 7-8 | 5.1 → 5.4 (tuỳ độ ưu tiên multi-user) | Auth + monitoring + backup |

**Khi user upgrade Gemini paid** → swap 3.1 vào tuần đang làm (chỉ đổi 2 env var, ~30 phút).

---

## Verification per phase (smoke test)

- **End Phase 1**: Force kill 1 key → render success với key fallback. DB `Video.masterVideoKey` luôn populated sau pipeline. Lỗi key invalid → user thấy message tiếng Việt rõ.
- **End Phase 2**: Edit sub trong UI → video update. Trim 32s → 20s. Export TikTok 9:16 → file mới. Drag frame → reorder persist.
- **End Phase 3**: Render không có Veo3 key → output vẫn xem được như video Pictory free tier. Có BGM dưới voice. Đổi giọng → audio đổi.
- **End Phase 4**: Mọi action có toast feedback. Loading skeleton thay "Đang tải". Add API key qua FE → n8n có credential mới auto.
- **End Phase 5**: Phải login mới vào được. Sentry có errors khi cố tình throw. Backup chạy daily, restore được.

---

## Out of scope v1 (tránh scope creep)

Không làm trong plan này — sẽ revisit sau khi v1 stable:

- AI avatar (Synthesia clone) — feature lớn, chi phí cao
- Voice cloning thật (XTTS/Bark on-prem) — GPU yêu cầu cao
- Multi-tenant billing — chưa có business model
- Analytics: view/engagement tracking từ YouTube/TikTok API
- Mobile app — web responsive đủ cho v1
- GraphQL — REST đủ dùng, theo nguyên tắc trong plan kiến trúc gốc
- Real-time collaboration (multiple user edit cùng video)
- Bulk import (Excel → 100 video một lần) — dễ trigger quota issue
