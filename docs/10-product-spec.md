# 10 — Product Specification (từ codebase)

> Tài liệu này **mô tả sản phẩm dựa trên code thực tế** (FE pages + BE controllers + Python worker scripts). Không phải design aspirational — chỉ những gì code đã làm.

## 1. Khẳng định sản phẩm là gì

**AI Video Content Automation** là một **self-hosted toolkit** chạy bằng Docker, cho phép 1 content creator solo tự sản xuất video kể chuyện / giải trí / tin tức cho channel của họ. Người dùng cung cấp 1 trong các đầu vào sau và nhận về 1 video mp4 hoàn chỉnh (cùng thumbnail + per-scene clips + tuỳ chọn auto-upload YouTube):

- URL YouTube (rewrite từ transcript)
- URL bài báo (rewrite tóm tắt)
- Truyện ngắn / file `.txt`
- Script viết tay

Sản phẩm là **multi-provider AI orchestrator**, không khoá vào 1 vendor — user tự gắn API key của Google / OpenAI / Anthropic / ElevenLabs / Runway / Replicate / Pexels và phân bổ mỗi key cho stage nào (SCRIPT / IMAGE / VIDEO / VOICE / BGM).

## 2. Modules thực tế (mapping FE page ↔ BE module)

| # | Module | Page (FE) | Controller (BE) | Service core |
|---|---|---|---|---|
| M1 | **Project workspace** | `/projects`, `/projects/[id]` | `project.controller.ts` | Mỗi project có niche/language/visual style/AI config riêng |
| M2 | **Tạo video** | `/projects/[id]/create` | `source.controller.ts` | 4 tab input (YouTube/Báo/Truyện/Tự nhập) + cấu hình video (scenes/duration/aspect) + voice config + AI config + character refs |
| M3 | **Quản lý video** | `/projects/[id]/videos`, `[vid]` | `video.controller.ts`, `scene.controller.ts` | List videos, detail per video, edit scene-by-scene, re-render scene, download per-clip |
| M4 | **Frame library** | `/projects/[id]/frames` | `frame.controller.ts` | Upload bộ ảnh tham chiếu cho consistent visual |
| M5 | **API Keys** | `/api-sources` | `api-key.controller.ts` | Add key (encrypted), assign cho capability, test live, rotation, quota tracking |
| M6 | **Job queue** | `/jobs` | `job.controller.ts` | Filter theo project, monitor render/transcript/notify queue |
| M7 | **Notifications** | `/notifications`, `/notifications/settings` | `notification.controller.ts` | In-app drawer + Telegram bot + log sink |
| M8 | **Settings** | `/settings` | (mixed) | Theme toggle, ENV-level config |

## 3. Inventory feature theo code

### M1 — Project workspace
- ✅ CRUD project (controller có 5 routes)
- ✅ Per-project config: `niche`, `language`, `visualStyle`, `description`, voice provider/id/speed/emotion, AI provider/model cho 4 stage (script/refine/image/video), `scriptBasePrompt` (custom system prompt cho AI)
- ✅ Slug auto-generated (unique)
- ✅ Cascade delete: xoá project → xoá hết videos/scenes/frames/characters/sources

### M2 — Tạo video (`create/page.tsx`)
- ✅ 4 tab input: YouTube URL, Báo URL/paste, Truyện file/paste, Tự nhập
- ✅ Card "Cấu hình video" bắt buộc chọn: số scenes (3-20) + tổng thời lượng (30s/1ph/2ph/3ph/5ph) + aspect ratio (16:9/9:16/1:1)
- ✅ Hint `≈ Xs / scene` tự tính
- ✅ Disclaimer bản quyền cho YouTube + truyện
- ✅ Draft persistence (localStorage `vca:draft:${projectId}`)
- ✅ Active source persistence (`vca:active-source:${projectId}`) — navigate ra và back vẫn resume PipelineProgress
- ✅ Voice config panel: provider (edge-tts/ElevenLabs/Google), voice id, speed, emotion, burn subtitles toggle
- ✅ AI config panel: per-stage provider + model selector với SUGGESTED_MODELS, free-text input cho custom model, hiện cost note (vd: `claude-opus-4-7: ~$15/1M tok`), warn nếu chưa có active key cho capability
- ✅ Custom **scriptBasePrompt** textarea override system prompt mặc định
- ✅ Character ref sheet: thêm/xoá character DNA prompt + ảnh tham chiếu
- ✅ Real-time PipelineProgress component (Socket.IO subscribe `/jobs` namespace, room `video:${id}`)

### M3 — Quản lý video
- ✅ List videos theo project (dashboard `videos/page.tsx`)
- ✅ Detail page `videos/[vid]/page.tsx`: master video player, scene grid, cost, logs tab
- ✅ Per-scene: regenerate, edit voiceover/prompt
- ✅ Per-scene clips download (`/videos/:id/clips`)
- ✅ Preview qua presigned MinIO URL (TTL 1h)
- ✅ Auto-mark stale source `failed` sau 15 phút kẹt

### M4 — Frame library
- ✅ CRUD frame + upload nhiều ảnh
- ✅ Reorder ảnh trong frame
- ✅ Sort order
- ❌ Drag-drop reorder UI: chưa (xem [08-roadmap.md](08-roadmap.md) Phase 2.4)

### M5 — API Keys (`api-sources/page.tsx`)
- ✅ Add key với auto-detect provider từ prefix (`AIza` → google, `sk-ant-` → anthropic, `sk-` → openai, `xi-` → elevenlabs, `key_` → runway)
- ✅ Multi-capability per key: 1 Gemini key cover SCRIPT + IMAGE + VIDEO
- ✅ Encrypted at rest (AES-256-GCM)
- ✅ Test live: per-key button + "Test tất cả" button (de-dup theo provider:keyMasked)
- ✅ Health badge: OK (xanh + latency) / Hết quota (amber) / Hỏng (đỏ) / Chưa test (xám)
- ✅ Relative time "Test gần nhất: X phút trước"
- ✅ Rotation: pick active key có `quotaUsed` nhỏ nhất (`/api-keys/internal/active`)
- ✅ Auto-bump `quotaUsed` mỗi lần pick (best-effort)
- ✅ Reset quota button
- ✅ Telegram test message

### M6 — Job queue (`jobs/page.tsx`)
- ✅ Wrap `<ProjectGate>` — bắt buộc chọn dự án mới hiện
- ✅ Filter: queue (`render` / `transcript-fetch` / `notify`) + status
- ✅ Mobile responsive: card-list trên mobile, table trên desktop
- ✅ Live progress bar + auto-refresh 5s
- ✅ Subquery: jobs filter theo `projectId` qua `video.projectId`

### M7 — Notifications
- ✅ In-app drawer (component `NotificationDrawer`)
- ✅ Telegram bot integration: bot token + chat ID lưu DB (qua UI `/notifications/settings`), fallback env
- ✅ Notification log per project + per video
- ✅ Sự kiện trigger: `video_complete`, errors, milestones

### M8 — Settings
- ✅ Theme toggle (dark/light) — light mode đã polish toàn diện
- ✅ Sidebar responsive (hamburger drawer trên mobile)

### Pipeline orchestration (cross-cutting)
- ✅ n8n workflows: 01 idea-and-script (legacy), 02 scene-generation (active), 03 render-and-upload
- ✅ BullMQ queues: `render`, `transcript-fetch`, `notify`
- ✅ Python worker: image (Imagen/DALL-E/Pexels), video (Veo3/local slideshow Ken Burns), voice (ElevenLabs/edge-tts), BGM (ElevenLabs Music), assembly (ffmpeg+MoviePy)
- ✅ Thumbnail auto-generation
- ✅ Per-scene MinIO upload + master upload
- ✅ Webhook callback chain: worker → BE → Socket.IO → FE
- ⚠️ Auto-upload YouTube: code có nhưng cần OAuth setup riêng

### Project-binding architecture (mới thêm)
- ✅ `useSelectedProject` hook: URL > localStorage > validate ngược projects list
- ✅ `<ProjectGate>` component: chưa chọn → card picker inline
- ✅ TopBar dropdown: persist localStorage immediately, hiện amber khi chưa chọn
- ✅ Sidebar: items requiresProject có icon ⚠️ amber khi chưa chọn

### Operational (không user-facing)
- ✅ Prisma migrations: auto-apply on backend start (`prisma migrate deploy`)
- ✅ Healthcheck Postgres/Redis/MinIO
- ✅ MinIO buckets auto-init (`assets` private, `public-thumbnails` public-read)
- ✅ Stale source auto-fail (>15min)

## 4. Người dùng có thể làm gì ngay sau `docker compose up`

Theo [Readme.md](../Readme.md) + code thực tế:

1. **Tạo project** với niche/language tự chọn
2. **Add ít nhất 1 SCRIPT key** (free: Google AI Studio Gemini) tại `/api-sources`
3. **Vào project → Tạo video**: paste link/script + chọn cấu hình → bấm "Tạo video"
4. **Theo dõi realtime** qua PipelineProgress (Socket.IO)
5. **Download** master mp4 + per-scene clips

**Free path** (không paid key): Gemini Flash (script) + Pexels (image) + edge-tts (voice) + local slideshow (video) = video output ~720p Ken Burns style.

**Paid path** (full quality): Gemini Pro (script) + Imagen Ultra (image) + Veo3 (video) + ElevenLabs (voice) + ElevenLabs Music (BGM) = cinematic quality.

## 5. Giới hạn đã biết (từ code)

- 🚫 **Single-user**: chưa có auth (basic auth là Phase v2 trong roadmap)
- 🚫 **Trình edit phụ đề trực quan**: chưa (Phase 2.1 trong [08-roadmap.md](08-roadmap.md))
- 🚫 **Video trimmer / crop tool**: chưa (Phase 2.2/2.4)
- 🚫 **Drag-drop reorder frames**: chưa
- ⚠️ **Auto-upload YouTube**: code khung có nhưng cần OAuth setup
- ⚠️ **Multi-language voice**: limited (ElevenLabs multilingual ổn, edge-tts có sẵn vi/en)
- ⚠️ **Veo3 paid**: cần Google Cloud project + billing
- ⚠️ **Single-host deploy**: chưa horizontal-scale-out (BullMQ + MinIO đã unlock, chưa wire orchestrator)

## 6. Đối tượng người dùng phù hợp

Theo persona Hằng trong [07-ux-design.md § 0](07-ux-design.md):
- Solo content creator (kể chuyện, tin tức, giải trí) trên YouTube
- Không biết edit video chuyên sâu
- Muốn kiểm soát chi phí AI (multi-provider, quota tracking)
- Sẵn sàng tự host (có máy/VPS chạy Docker)

**KHÔNG phù hợp**:
- Studio nhiều người (chưa có RBAC)
- Video editing chuyên nghiệp (chưa có timeline editor)
- Workflow phức tạp với nhiều branching (n8n có giới hạn)

## Liên quan

- [11-feature-checklists.md](11-feature-checklists.md) — acceptance criteria từng feature
- [12-market-comparison.md](12-market-comparison.md) — so với tools tương tự trên thị trường
- [08-roadmap.md](08-roadmap.md) — feature thiếu + plan triển khai
