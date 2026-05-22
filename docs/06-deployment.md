# Hướng dẫn triển khai — AI YouTube Content Engine

Tài liệu này hướng dẫn từ A→Z cách deploy một engine tự động sản xuất video YouTube cho **bất kỳ niche nào**, dựa trên việc phân tích một kênh YouTube tham chiếu.

---

## 1. Luồng hoạt động

```
[Bạn cung cấp URL kênh YouTube tham chiếu]
        │
        ▼
[YouTube Data API]  ── fetch channel stats + top 10 videos (REAL data)
        │
        ▼
[GPT-5.4-mini]  ── phân tích pattern, tạo topic mới phù hợp niche
        │
        ▼
[GPT-5.4-mini]  ── viết kịch bản thô (15 hoặc 20 phút) + prompt ảnh
        │
        ▼
[Claude Opus 4.7]  ── viết lại kịch bản cho hay (retention + emotion)
        │
        ▼
[GPT-5.4-mini QA]  ── chấm điểm 0-100 (≥75 mới qua, sequential gate)
        │
        ▼
[GPT-5.4-mini]  ── chia kịch bản thành scenes ~8s
        │
        ▼
[gpt-image-2]  ── tạo ảnh minh họa từng scene (size 1536x1024)
        │
        ▼
[Python Worker]
   ├── ElevenLabs voiceover
   ├── Veo3 / Runway video gen
   ├── ElevenLabs Music BGM (khớp core_emotion)
   ├── MoviePy ghép master video
   ├── Generate SRT subtitles
   ├── (optional) Burn-in subtitles cho TikTok
   ├── Generate thumbnails
   └── Upload YouTube draft
        │
        ▼
[Telegram] ── thông báo kết quả + link
```

---

## 2. Yêu cầu

### Hardware (server)
- **RAM:** ≥ 8 GB (rendering MoviePy + ffmpeg)
- **Disk:** ≥ 50 GB (assets tạm + final output)
- **CPU:** ≥ 4 cores
- **Mạng:** ≥ 50 Mbps (download/upload nhiều)
- **OS:** Linux (đã test Ubuntu 22.04). MacOS/Windows hoạt động qua Docker.

### Software
- Docker + Docker Compose v2
- `git`

### Tài khoản API — bảng đánh giá thực tế (đã verify trên web tháng 4/2026)

| # | Service | Dùng để | Status | Chi phí | Verify |
|---|---|---|---|---|---|
| 1 | **OpenAI** | Topic, script, image (DALL-E), scene breakdown, SEO | ✅ Official | Trả phí ~$5-10/video | [docs](https://platform.openai.com/docs) |
| 2 | **Anthropic Claude** | Refine script | ✅ Official | Trả phí ~$0.5/video | [docs](https://docs.anthropic.com) |
| 3 | **ElevenLabs Voice** | Voiceover (text-to-speech) | ✅ Official | 10k chars free/tháng, paid ~$5/tháng | [docs](https://elevenlabs.io/docs/api-reference/text-to-speech) |
| 4 | **ElevenLabs Music** ⭐ | BGM instrumental (NEW default) | ✅ Official | Yêu cầu paid plan (cùng key voice) | [docs](https://elevenlabs.io/docs/api-reference/music/compose) |
| 5 | **YouTube Data API v3** | Phân tích kênh tham chiếu (real data) | ✅ Official Google | **Free** 10k units/ngày | [docs](https://developers.google.com/youtube/v3/docs) |
| 6 | **YouTube Upload OAuth2** | Upload video draft | ✅ Official Google | Free | [docs](https://developers.google.com/youtube/v3/guides/uploading_a_video) |
| 7 | **Google Veo3** (default video) | AI video generation | ✅ Official Gemini API | Trả phí ~$0.4/clip 8s | [docs](https://ai.google.dev/gemini-api/docs/video) |
| 8 | Runway Gen-4 Turbo (alternative) | AI video generation | ✅ Official | Trả phí ~$0.5/clip | [docs](https://docs.dev.runwayml.com) |
| 9 | Telegram Bot | Notification | ✅ Official | Free | [docs](https://core.telegram.org/bots/api) |
| 10 | ~~Suno~~ (deprecated trong repo) | BGM | ⚠️ **Không có official API** — `studio-api.suno.ai` là reverse-engineered, vi phạm ToS Suno | N/A | [đọc thêm](https://aimlapi.com/blog/the-suno-api-reality) |

> **TL;DR — Bạn chỉ cần đăng ký 4 service để chạy:**
> 1. **OpenAI** (text + image)
> 2. **Anthropic** (refine)
> 3. **ElevenLabs** (voice + music — 1 key dùng cả 2)
> 4. **Google AI Studio** (YouTube Data API + Veo3 — 1 key dùng cả 2)
>
> Cộng thêm OAuth YouTube nếu muốn auto upload, và Telegram Bot nếu muốn notify.

### Models đã verify (tháng 4/2026)

| Env var | Default | Trạng thái |
|---|---|---|
| `OPENAI_TEXT_MODEL` | `gpt-5.4-mini` | ✅ Released 17/3/2026, $0.75/M input + $4.5/M output, 400K context. Backup: `gpt-5.5` (premium $5/M) |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | ✅ Released 21/4/2026, reasoning model, supports up to 4K. Backup: `gpt-image-1.5` |
| `CLAUDE_MODEL` | `claude-opus-4-7` | ✅ Newest Claude Opus, best for creative scriptwriting. Cheaper alt: `claude-sonnet-4-6` (~5x rẻ) |
| `ELEVENLABS_MODEL` (voice) | `eleven_multilingual_v2` | ✅ Available |
| `ELEVENLABS_MUSIC_MODEL` | `music_v1` | ✅ Available (paid only) |
| `VEO3_MODEL` | `veo-3.1-generate-preview` | ✅ Current (3.0-preview deprecated 4/2026) |
| `VIDEO_MODEL` (Runway) | `gen4_turbo` | ✅ Available |

---

## 3. Lấy API keys

### 3.1 OpenAI
1. https://platform.openai.com/api-keys → tạo key bắt đầu bằng `sk-`
2. Top up balance ≥ $20 (mỗi video tốn ~$2-5 cho text + image)

### 3.2 Anthropic (Claude)
1. https://console.anthropic.com → tạo key bắt đầu bằng `sk-ant-`
2. Top up balance ≥ $10

### 3.3 YouTube Data API v3 (CRITICAL — phân tích kênh thật)
1. https://console.cloud.google.com → tạo project mới
2. APIs & Services → Library → tìm "YouTube Data API v3" → **Enable**
3. APIs & Services → Credentials → Create Credentials → API key
4. Copy key → `YOUTUBE_DATA_API_KEY`
5. Quota mặc định: 10,000 units/ngày (đủ phân tích ~50 kênh/ngày)

> ⚠️ **Quan trọng:** Nếu thiếu key này, GPT sẽ không phân tích kênh thật mà chỉ generate topic dựa trên `CHANNEL_NICHE`.

### 3.4 ElevenLabs (voice + music — 1 key dùng cả 2)
1. https://elevenlabs.io → Profile → API Keys → tạo key
2. Voice Lab → chọn 1 voice → copy `voice_id`
3. Set `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`
4. **Music API yêu cầu plan trả phí** (Creator $22/tháng trở lên). Plan free cho voice nhưng KHÔNG có music — nếu skip, set `MUSIC_PROVIDER=static`.

### 3.5 Google Veo3 (video generation)
1. https://aistudio.google.com → Get API key (cùng project với YouTube Data API ở 3.3 cũng được — share 1 key)
2. Set `GOOGLE_API_KEY`
3. Veo3 yêu cầu billing account active. Tier 1 đủ cho test.

### 3.6 BGM (đã chuyển sang ElevenLabs Music — KHÔNG cần Suno nữa)
- Default: `MUSIC_PROVIDER=elevenlabs` → dùng cùng `ELEVENLABS_API_KEY` ở 3.4
- Nếu không muốn trả ElevenLabs paid plan: `MUSIC_PROVIDER=static` → dùng `BGM_FALLBACK_URL` (mp3 public)
- Suno đã bị **deprecated** trong repo này vì:
  - Suno KHÔNG có public API official
  - Endpoint `studio-api.suno.ai` là reverse-engineered, vi phạm ToS
  - Có thể bị Cloudflare block bất kỳ lúc nào
- Nếu vẫn muốn dùng Suno (qua 3rd-party gateway): set `MUSIC_PROVIDER=suno` + `SUNO_API_KEY` + `SUNO_API_BASE` (gateway URL như `https://api.sunoapi.org`)

### 3.7 YouTube OAuth2 (upload)
1. https://console.cloud.google.com → cùng project ở 3.3
2. Enable "YouTube Data API v3" (đã có) + "YouTube Upload"
3. OAuth consent screen → External → fill các trường + add scope `https://www.googleapis.com/auth/youtube.upload`
4. Credentials → Create OAuth client ID → Type: Web application → add `https://developers.google.com/oauthplayground` vào Redirect URIs
5. Copy `Client ID` + `Client Secret`
6. Mở https://developers.google.com/oauthplayground:
   - Settings (⚙️) → tick "Use your own OAuth credentials" → paste Client ID + Secret
   - Step 1: scope `https://www.googleapis.com/auth/youtube.upload` → Authorize → đăng nhập Gmail của kênh YouTube
   - Step 2: Exchange authorization code → copy `Refresh token`
7. Set `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`

### 3.8 Telegram (notifications)
1. Chat với `@BotFather` → `/newbot` → lấy `BOT_TOKEN`
2. Chat với bot vừa tạo → gửi `/start`
3. Mở `https://api.telegram.org/bot<TOKEN>/getUpdates` → lấy `chat.id`
4. Set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`

---

## 4. Cấu hình `.env`

```bash
git clone <repo-url>
cd video-content-engine
cp .env.example .env
nano .env
```

### Tối thiểu để chạy được (4 API keys + OAuth YouTube):
```env
# === Niche ===
CHANNEL_NAME=My Channel
CHANNEL_NICHE=cooking                  # vd: travel | finance | cooking | self-help
CHANNEL_URL=https://www.youtube.com/@channel_to_analyze
CHANNEL_LANGUAGE=English
TARGET_DURATION_MINUTES=15

# === Required API keys ===
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=...
GOOGLE_API_KEY=AIza...                 # Same key dùng cho cả Veo3 + YouTube Data API
YOUTUBE_DATA_API_KEY=AIza...           # Có thể là cùng key với GOOGLE_API_KEY nếu cùng project

# === Models (default values, không cần đổi) ===
OPENAI_TEXT_MODEL=gpt-5.4-mini
OPENAI_IMAGE_MODEL=gpt-image-2
CLAUDE_MODEL=claude-opus-4-7
VEO3_MODEL=veo-3.1-generate-preview

# === Video provider ===
VIDEO_PROVIDER=veo3                    # veo3 | runway

# === Music provider ===
MUSIC_PROVIDER=elevenlabs              # elevenlabs (recommended) | suno | static
ELEVENLABS_MUSIC_MODEL=music_v1
BGM_DURATION_MS=120000

# === Audio Mix (cho final video) ===
VEO_AUDIO_VOLUME=0.3                   # Veo3 native ambient/SFX (set 0 để disable)
VOICE_VOLUME=1.0                       # ElevenLabs voiceover (dominant)
BGM_VOLUME=0.15                        # ElevenLabs Music BGM (ducked dưới narration)
BGM_CROSSFADE_SEC=2.0                  # Crossfade khi BGM loop

# === Image-to-Video (visual continuity) ===
USE_IMAGE_TO_VIDEO=true                # Pass DALL-E image vào Veo3 → video khớp visual

# === Subtitles ===
BURN_SUBTITLES=false                   # true nếu cần burn-in cho TikTok/Shorts

# === YouTube Upload (optional — bỏ qua nếu chỉ test render) ===
YOUTUBE_CLIENT_ID=...apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=1//...
YOUTUBE_PRIVACY_STATUS=private

# === Notifications (optional) ===
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# === Database (giữ default cho dev, đổi password cho prod) ===
POSTGRES_USER=user
POSTGRES_PASSWORD=changeme_in_prod
POSTGRES_DB=content_engine
DATABASE_URL=postgresql://user:changeme_in_prod@postgres:5432/content_engine

# === Quality control ===
MIN_QA_SCORE=75
BUDGET_LIMIT_PER_VIDEO=100
```

> 💡 **Tip:** Cùng `GOOGLE_API_KEY` (tạo từ Google Cloud Console) có thể dùng cho cả Veo3 (Gemini API) và YouTube Data API v3 nếu enable cả 2 service trong project. Tiết kiệm 1 key.

> 🔒 **Production:** đổi `POSTGRES_PASSWORD` thành chuỗi random mạnh và update đồng thời trong `DATABASE_URL`.

---

## 5. Khởi động hệ thống

```bash
docker compose up -d --build
```

Đợi ~2 phút lần đầu (build worker image, tải fonts). Verify:

```bash
docker compose ps
# Cả 3 service phải có status "running" hoặc "healthy":
# - postgres
# - n8n
# - python_worker

# Health check
curl http://localhost:8000/health
# Kỳ vọng: {"status":"ok"}

curl http://localhost:5678
# Kỳ vọng: trang đăng nhập n8n
```

Logs nếu có lỗi:
```bash
docker compose logs -f python_worker
docker compose logs -f n8n
docker compose logs -f postgres
```

---

## 6. Cấu hình n8n

### 6.1 Setup admin account
1. Mở `http://localhost:5678` (hoặc `http://<server-ip>:5678`)
2. Tạo admin account đầu tiên

### 6.2 Tạo Postgres credential (BẮT BUỘC trước khi import)
1. n8n UI → Credentials → New → Postgres
2. **Quan trọng:** trong workflow JSON đã hardcode credential ID `postgres-cred`. Để tránh lỗi import, hãy:
   - Cách A (dễ): Đặt **Name** = `Postgres` → save → khi import workflow, n8n sẽ tự match theo tên.
   - Cách B: Sau khi import, mở từng node Postgres → chọn credential bằng tay.
3. Thông số kết nối:
   ```
   Host:         postgres
   Database:     content_engine    (hoặc đúng POSTGRES_DB trong .env)
   User:         user              (hoặc đúng POSTGRES_USER)
   Password:     <POSTGRES_PASSWORD>
   Port:         5432
   SSL:          disable
   ```
4. Test → Save

### 6.3 Import workflows
Tự động qua service `n8n_init` trong [docker-compose.yml](../docker-compose.yml) — chạy 1 lần khi volume `n8n_data` trống, import + activate cả 3 file:
- `n8n_workflows/01_idea_and_script.json` — pipeline chính
- `n8n_workflows/02_scene_generation.json` — entry điểm thủ công khi đã có script
- `n8n_workflows/03_render_and_upload.json` — webhook nhận callback từ worker

Verify:
```bash
docker compose logs n8n_init       # phải thấy "Seeded 3 workflows"
docker compose exec n8n n8n list:workflow --active=true   # phải ra 3 dòng
```

Re-seed sau khi sửa file workflow JSON: `docker compose down -v` (xóa volume) hoặc `docker compose exec n8n rm /home/node/.n8n/.seeded && docker compose up -d n8n_init`.

> ⚠️ Bỏ qua `reference_full_pipeline.json` — đây là legacy reference, không dùng.

### 6.4 Verify webhook URLs
n8n sẽ generate webhook URLs dạng:
- `http://localhost:5678/webhook/start-pipeline` — trigger workflow 01
- `http://localhost:5678/webhook/generate-scenes` — trigger workflow 02 (đã có script)
- `http://localhost:5678/webhook/render-complete` — worker callback workflow 03

Trong **Test mode** thì path là `/webhook-test/...`. Để chạy production, click `Active` ở từng workflow.

---

## 7. Test chạy thử

### 7.1 Test bằng manual trigger trong n8n
1. Mở workflow `01 - Channel Analysis & Script`
2. Click node **Manual Trigger** → **Execute Workflow**
3. Quan sát từng node sáng xanh. Kiểm tra output node `Code - Fetch YouTube Channel Data`:
   - Nếu `channel_analysis` có `channel_title`, `top_videos[]` → ✅ YouTube API hoạt động
   - Nếu `channel_analysis: null` → kiểm tra `YOUTUBE_DATA_API_KEY` và `CHANNEL_URL`
   - Nếu `channel_analysis.error` → đọc error message (thường là quota / URL parse)

### 7.2 Test bằng webhook
```bash
curl -X POST http://localhost:5678/webhook/start-pipeline \
  -H "Content-Type: application/json" \
  -d '{
    "channel_url": "https://www.youtube.com/@MrBeast",
    "channel_niche": "viral entertainment",
    "language": "English",
    "target_duration_minutes": 15
  }'
```

Kỳ vọng:
```json
{ "status": "accepted", "episode_id": "ep_1234567890", "scenes": 112, "worker_response": {...} }
```

### 7.3 Theo dõi tiến độ
```bash
# Status từ DB
curl http://localhost:8000/api/v1/status/ep_1234567890

# Worker logs realtime
docker compose logs -f python_worker

# Output files
ls -lh assets_temp/final_output/
```

Kỳ vọng sau ~10-30 phút (tuỳ độ dài + Veo3 / Runway queue):
- `assets_temp/final_output/master_video_<id>.mp4` — video gốc
- `assets_temp/final_output/subtitles_<id>.srt` — phụ đề (nếu `BURN_SUBTITLES=false`)
- `assets_temp/final_output/thumbnails_<id>/variant_*.jpg`
- Telegram nhận message: `✅ RENDER COMPLETE`

---

## 8. Production

### 8.1 Bật scheduled trigger
- Mặc định workflow 01 chạy T2 + T5 lúc 8:00 sáng (config trong `Schedule Trigger`)
- Đổi tần suất: mở node → sửa `interval`

### 8.2 Kiểm soát chi phí
- `BUDGET_LIMIT_PER_VIDEO=100` — worker reject nếu estimate > $100
- Mỗi video ~ $10-15 với GPT-5.4-mini + Claude + `gpt-image-2` + ElevenLabs voice + Veo3 (8s × ~100 scenes)
- ElevenLabs Music BGM ~ $0.3/track (cùng key)
- Runway Gen-4 Turbo có thể đẩy chi phí lên $50-60/video — set `VIDEO_PROVIDER=veo3` để tiết kiệm
- Theo dõi: `SELECT video_id, total_cost_usd FROM videos ORDER BY created_at DESC;`

### 8.3 Backup database
```bash
# Backup
docker compose exec postgres pg_dump -U user content_engine > backup_$(date +%F).sql

# Restore
cat backup_2026-04-29.sql | docker compose exec -T postgres psql -U user content_engine
```

### 8.4 Update sau khi pull code mới
```bash
git pull
docker compose up -d --build python_worker
docker compose restart n8n
# Re-import lại workflow nếu file JSON thay đổi
```

### 8.5 Bảo mật
- **Không expose port 5678 (n8n)** ra internet — đặt sau reverse proxy (nginx/Caddy) + basic auth hoặc Cloudflare Tunnel
- Đổi `POSTGRES_PASSWORD` thành chuỗi mạnh trong production
- `.env` đã có trong `.gitignore` — không commit

---

## 9. Troubleshooting

| Triệu chứng | Nguyên nhân | Fix |
|---|---|---|
| Workflow import báo "Postgres credential not found" | Chưa tạo credential trong n8n | Bước 6.2 |
| `Code - Fetch YouTube Channel Data` trả `null` | Thiếu `YOUTUBE_DATA_API_KEY` hoặc `CHANNEL_URL` rỗng | Set env và `docker compose restart n8n` |
| `Code - Fetch YouTube Channel Data` báo `Could not resolve channel ID` | URL sai format | Dùng `https://youtube.com/@handle` hoặc `/channel/UCxxx` |
| `AI - Generate Topic` 401 | API key sai | Verify `OPENAI_API_KEY` |
| `HTTP - Claude Refine Script` 400 model not found | `CLAUDE_MODEL` cũ | Set `CLAUDE_MODEL=claude-opus-4-7` |
| `Code - QA Gate` throw `score < 75` | Script bị từ chối bởi QA | Giảm `MIN_QA_SCORE`, hoặc check `topic.audience_promise` quá rộng |
| Worker không nhận request | Port 8000 conflict / docker network | `docker compose logs python_worker`, verify `http://python_worker:8000` từ n8n |
| Veo3 model deprecated 4xx | Đang dùng `veo-3.0-generate-preview` cũ | Set `VEO3_MODEL=veo-3.1-generate-preview` |
| Veo3 timeout 300s | Queue Google quá dài | Tăng `VEO3_POLL_TIMEOUT=600` hoặc switch `VIDEO_PROVIDER=runway` |
| Veo3 image-to-video fail (image attach error) | SDK version cũ hoặc image format lỗi | Set `USE_IMAGE_TO_VIDEO=false` để revert text-only mode |
| Audio narration không nghe rõ (bị Veo3 SFX át) | `VEO_AUDIO_VOLUME` quá cao | Giảm `VEO_AUDIO_VOLUME=0.15` hoặc set `0` để disable hoàn toàn |
| BGM bị cắt cụt giữa video | BGM ngắn hơn video, fadeout hard cut | Tăng `BGM_CROSSFADE_SEC=3.0` |
| DALL-E 400 "invalid size" | Đang dùng `1792x1024` với `gpt-image-2` | Repo đã fix sang `1536x1024`. Pull code mới và rebuild. |
| Subtitle burn-in fail | ffmpeg path lỗi escape | Set `SUBTITLE_STYLE=` (empty) để dùng default |
| YouTube upload "401 invalid_grant" | Refresh token hết hạn | Tạo lại OAuth refresh token (bước 3.7) |
| ElevenLabs Music 401 | Free plan không có music API | Upgrade Creator plan ($22/tháng) hoặc switch `MUSIC_PROVIDER=static` |
| Suno timeout/503 | studio-api.suno.ai bị block | Switch `MUSIC_PROVIDER=elevenlabs` (recommended) hoặc `static` |
| Postgres connection refused | n8n start trước postgres ready | `docker compose restart n8n` |

---

## 10. Giới hạn đã biết (sẽ cải tiến)

1. **Thumbnail từ DALL-E không upload lên YouTube** — workflow 01 tạo thumbnail URL nhưng worker chưa download và set qua `youtube.thumbnails().set()` API. Hiện thumbnail trên YouTube là frame mặc định.
2. **TikTok highlights chưa auto-extract** — manifest không có `highlights[]`, `extract_tiktok_clips` luôn skip. Muốn dùng TikTok cần POST manual với mảng `highlights`.
3. **Character consistency** — không còn dùng character DNA template (đã chuyển sang generic). Ảnh DALL-E giữa các scene có thể khác nhân vật.
4. **Frame chaining** — scene N+1 không reference frame cuối scene N → không có visual continuity.
5. **A/B test thumbnail** — thumbnail_gen tạo 3 variants nhưng chưa chọn variant tốt nhất.
6. **Cost log chỉ ghi tổng `pipeline_total`** — không break down per service.

---

## 11. Cấu trúc thư mục sau khi chạy

```text
video-content-engine/
├── .env                         # Bí mật — không commit
├── docker-compose.yml
├── 06-deployment.md            # ← bạn đang đọc (now in docs/)
├── README.md
├── init.sql                     # Tự apply lần đầu vào postgres
│
├── n8n_workflows/
│   ├── 01_idea_and_script.json
│   ├── 02_scene_generation.json
│   ├── 03_render_and_upload.json
│   └── reference_full_pipeline.json   # Legacy — bỏ qua
│
├── prompts_library/             # Templates (optional)
│
├── worker/                      # Python service
│   ├── main_server.py           # API /api/v1/render + pipeline orchestration
│   ├── video_assembler.py       # Ghép video + ducking BGM + ffmpeg burn-in subs
│   ├── asset_downloader.py      # ElevenLabs voiceover + Veo3/Runway video
│   ├── elevenlabs_music.py      # BGM official API (default music provider)
│   ├── suno_client.py           # BGM via Suno (legacy/optional, unofficial)
│   ├── thumbnail_gen.py         # Pillow text overlay (3 variants)
│   ├── tiktok_cutter.py         # 9:16 crop + hardsub cho Shorts
│   ├── veo3_generator.py        # Google Veo 3.1 video gen
│   ├── distributor.py           # YouTube OAuth upload + Telegram
│   ├── clean_temp.py            # Cleanup assets sau upload
│   └── Dockerfile
│
└── assets_temp/                 # Tự tạo runtime — đã trong .gitignore
    ├── <episode_id>/            # Scene assets — auto cleaned sau upload
    ├── bgm/
    │   └── background_<id>.mp3  # BGM khớp emotion (per video)
    └── final_output/
        ├── master_video_<id>.mp4
        ├── subtitles_<id>.srt
        └── thumbnails_<id>/variant_{1,2,3}.jpg
```

---

## 12. Tham khảo nhanh

- **OpenAI Responses API:** https://platform.openai.com/docs/api-reference/responses
- **Anthropic Messages API:** https://docs.anthropic.com/en/api/messages
- **YouTube Data API v3:** https://developers.google.com/youtube/v3/docs
- **YouTube OAuth Playground:** https://developers.google.com/oauthplayground
- **Google Veo3:** https://ai.google.dev/gemini-api/docs/video
- **n8n Webhook docs:** https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.webhook/
