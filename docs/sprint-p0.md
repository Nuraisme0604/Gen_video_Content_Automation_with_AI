# Sprint — P0 Blocking (kế hoạch chi tiết)

> **Mục tiêu:** clear 2 items 🔴 P0 còn lại trong [11-feature-checklists.md](11-feature-checklists.md#-p0--blocking-làm-trước).
>
> **Time-boxed:** sprint này phụ thuộc 1 quyết định lớn (Vertex AI paid?). Thời gian biến động: **2-3h nếu free path**, **+4-6h nếu paid**.

---

## ⚠️ Cập nhật quan trọng trước khi bắt đầu

Khi rà code lại, **BGM logic đã được implement đầy đủ** trong worker:

| File | Hiện trạng |
|---|---|
| [main_server.py:100 `_ensure_bgm`](../video-content-engine/worker/main_server.py) | Chain 3 provider: ElevenLabs Music → Suno (deprecated) → static URL fallback |
| [video_assembler.py:84-116](../video-content-engine/worker/video_assembler.py) | Mix BGM tại 15% volume với narration qua `CompositeAudioClip`, auto-loop nếu BGM ngắn hơn video, fade in/out |
| [elevenlabs_music.py](../video-content-engine/worker/elevenlabs_music.py) | Client gọi `/v1/music` (cần paid ElevenLabs) |
| [.env.example](../.env.example) | `BGM_VOLUME=0.15`, `BGM_FALLBACK_URL=https://github.com/.../sample.mp3` |

→ Vậy P0 BGM **về cơ bản đã xong cho free path** (sample.mp3 từ GitHub là fallback). Sprint này chỉ cần:
1. **Verify end-to-end** BGM thực sự được mix vào output mp4
2. (Optional polish) Bundle CC0 library local thay vì 1 sample lặp đi lặp lại
3. (Optional polish) Per-project BGM config UI

→ **Có khả năng cao** BGM item đã đủ điều kiện tick `[x]`, chỉ cần verify. Phần lớn sprint thực ra là **quyết định Vertex AI** + nếu yes thì wire-up.

## Danh sách tasks

| # | Task | Effort | Type | Risk |
|---|---|---|---|---|
| P0-A | Verify BGM E2E (free path đã đủ chưa?) | 30min | Verification | thấp |
| P0-B | (Optional) Bundle CC0 BGM library 3-5 bài | 1h | Polish | thấp |
| P0-C | Decision: Vertex AI paid hay free? | 30min | Quyết định người dùng | — |
| P0-D | (Nếu Vertex AI = YES) Wire-up Imagen vào n8n workflow | 1.5h | Code | trung |
| P0-E | (Nếu Vertex AI = YES) Wire-up Veo3 + setup credentials | 2h | Code + Setup | cao (cost) |
| P0-F | (Optional) Per-project BGM config trong UI | 2h | Polish — không P0 strictly | thấp |

**Tổng:**
- Min path (chỉ verify): ~30min
- Free path + polish: ~2-3h
- Full paid path: ~5-7h

## Pre-flight checklist

Trước khi gõ phím:

- [ ] Tạo branch: `git checkout -b sprint/p0-may-2026`
- [ ] Đảm bảo `docker compose ps` services healthy
- [ ] Có 1 project + 1 SCRIPT API key active (Gemini free OK)
- [ ] **Cho P0-E (Vertex AI)**: có Google Cloud account + billing enabled
- [ ] **Cho P0-E**: confirmed credit card hoặc free trial ($300) còn hạn

---

## P0-A. Verify BGM E2E (30min) — làm đầu tiên

### Context
BGM code đã có hết. Cần kiểm tra video output thực sự có nhạc nền chứ không phải silent.

### Acceptance criteria
Render 1 video manual → tải master.mp4 → mở bằng player → **nghe được nhạc nền dưới voice**. Volume nhạc nền < voice (~15% mặc định).

### Steps

1. **Submit 1 video manual đơn giản:**
   ```bash
   curl -X POST http://localhost:3001/api/v1/sources/manual \
     -H 'Content-Type: application/json' \
     -d '{
       "projectId": "<PROJECT_ID>",
       "title": "P0-A BGM verify test",
       "script": "Một buổi sáng đầu thu, tôi thức dậy trong căn phòng nhỏ. Ánh nắng xuyên qua khung cửa sổ.",
       "disclaimerAccepted": true,
       "sceneCount": 3,
       "targetDurationSec": 24,
       "aspectRatio": "9:16"
     }'
   ```

2. **Theo dõi pipeline** qua FE `/jobs` hoặc `docker logs vca_python_worker -f`. Đợi `status=done` (~2-5 phút cho slideshow free path).

3. **Tải master video:**
   ```bash
   VIDEO_ID=$(curl -s "http://localhost:3001/api/v1/sources/project/<PROJECT_ID>" | python3 -c "
   import json,sys
   sources = json.load(sys.stdin)
   latest = next((s for s in sources if s['title'].startswith('P0-A')), None)
   print(latest.get('videoId') if latest else '')
   ")
   curl -s "http://localhost:3001/api/v1/videos/$VIDEO_ID/preview-url" | python3 -c "
   import json,sys; print(json.load(sys.stdin).get('url'))
   "
   # Mở URL trong browser hoặc ffprobe
   ```

4. **Verify audio tracks bằng ffprobe:**
   ```bash
   ffprobe -v error -show_streams -select_streams a <PRESIGNED_URL> 2>&1 | head -20
   ```
   Kỳ vọng: 1 audio stream (voice + BGM đã được mix vào 1 track). Nếu `nb_streams=0` → BGM bị skip silent.

5. **Verify worker logs** không có error BGM:
   ```bash
   docker logs vca_python_worker 2>&1 | grep -iE "bgm|music|ensure_bgm" | tail -20
   ```
   Kỳ vọng: line "BGM downloaded to /assets_temp/bgm/background_<id>.mp3" hoặc "ElevenLabs Music generated".

### Possible outcomes

| Outcome | Action |
|---|---|
| ✅ Có nhạc nền + volume ổn | **Mark P0 BGM `[x]`** — sprint xong cho item này. Skip P0-B. |
| ⚠️ Có nhạc nhưng cùng 1 bài mỗi video (boring) | Tiếp P0-B (bundle CC0 library) |
| ❌ Silent — BGM bị skip | Debug: check `BGM_FALLBACK_URL` có reachable không (`curl -I $URL`), check disk write permission trên `/assets_temp/bgm/` |
| ❌ ElevenLabs Music error | Đúng — không có paid plan, expected. Phải dựa vào fallback URL hoặc CC0 library |

### Gotcha
- Worker volume mount `/assets_temp` cần writable. `docker exec vca_python_worker touch /assets_temp/test && rm /assets_temp/test`
- Lần đầu submit: `_ensure_bgm` download sample.mp3 — sẽ chậm 5-10s
- Lần submit thứ 2 với cùng video_id: BGM cached, dùng lại file đã download

---

## P0-B. (Optional) Bundle CC0 BGM library (1h)

### Context
Hiện free path luôn lấy 1 sample.mp3 từ GitHub → mọi video đều cùng bản nhạc → boring + có risk URL bị break.

### Acceptance criteria
Worker có thư viện 3-5 file CC0 mp3 bundled. `_ensure_bgm` random pick 1 file theo `core_emotion` (vd: sad → melancholy.mp3, happy → upbeat.mp3).

### Steps

1. **Source CC0 music** (1 trong các option):
   - **YouTube Audio Library**: vào studio.youtube.com → Audio Library → filter "No attribution required" → tải 5 bài (calm/upbeat/dramatic/melancholy/cinematic)
   - **Pixabay Music**: pixabay.com/music (CC0) — search "instrumental no copyright"
   - **Free Music Archive**: freemusicarchive.org — filter Public Domain
   - Convert sang mp3 nếu cần: `ffmpeg -i input.wav -c:a libmp3lame -q:a 4 output.mp3`

2. **Add vào worker Docker image:**
   ```bash
   # Tạo folder
   mkdir -p video-content-engine/worker/bgm_library/
   # Move 5 files vào
   cp ~/Downloads/calm.mp3 video-content-engine/worker/bgm_library/
   cp ~/Downloads/upbeat.mp3 video-content-engine/worker/bgm_library/
   # ... 3 file nữa
   ```

3. **Sửa Dockerfile worker** (`video-content-engine/worker/Dockerfile`):
   - Thêm `COPY bgm_library/ /app/bgm_library/`

4. **Sửa `_ensure_bgm` trong [main_server.py](../video-content-engine/worker/main_server.py)**:
   - Trước khi fallback xuống `BGM_FALLBACK_URL`, thêm logic:
     ```python
     # Try bundled CC0 library first (no API call needed)
     LIB_DIR = "/app/bgm_library"
     emotion_map = {
       "sad": "melancholy.mp3", "happy": "upbeat.mp3",
       "dramatic": "dramatic.mp3", "cinematic": "cinematic.mp3",
       "calm": "calm.mp3",
     }
     candidate = emotion_map.get(core_emotion, "calm.mp3")
     lib_path = os.path.join(LIB_DIR, candidate)
     if os.path.exists(lib_path):
         shutil.copy(lib_path, bgm_path)
         logger.info(f"Used bundled CC0 BGM: {candidate}")
         return
     ```

5. **Rebuild worker:**
   ```bash
   docker compose build python_worker && docker compose up -d python_worker
   ```

6. **Add `.gitignore`** cho bgm_library nếu không muốn commit (file size lớn) — HOẶC commit cũng OK nếu < 5MB/file.

### Verify
- Submit 3 videos với `core_emotion` khác nhau (sad/happy/calm) → quan sát logs `Used bundled CC0 BGM: X.mp3` khác nhau
- Mở 3 master mp4 → nhạc nền khác nhau

### Gotcha
- **License**: PHẢI CC0 hoặc Public Domain. Royalty-free không phải free — vẫn cần attribution.
- **File size**: 5 file × 2-3 phút × ~3MB = ~15MB. Tăng size image worker đáng kể. Có thể optimize: ffmpeg `-q:a 6` (~96kbps) để giảm 50%.
- **Loop nhỏ**: nhạc 2-3 phút sẽ loop nếu video dài 10 phút. `video_assembler.py:101` đã handle `audio_loop` + crossfade.

---

## P0-C. Decision: Vertex AI paid hay free? (30min — user decision)

### Context
Hiện free path (Gemini Flash + Pexels + slideshow + edge-tts) cho output chấp nhận được nhưng:
- Image = stock photo từ Pexels (không phù hợp scene tự sinh)
- Video = slideshow Ken Burns trên ảnh stock (không phải "video AI" thực sự)
- Voice = edge-tts (chấp nhận được, không cảm xúc)

Paid path mở khoá:
- **Imagen 4**: ảnh tự sinh theo prompt (~$0.04-0.10/ảnh)
- **Veo 3**: video animation thật ~5-10s ($0.50/sec — đắt!)
- **Gemini 2.5 Pro**: script chất lượng cao hơn (~$0.001/1K tokens)

### Quyết định cần trả lời

| Câu hỏi | Có | Không |
|---|---|---|
| Có credit card đăng ký Google Cloud được? | → tiếp | → free path, skip P0-D/E |
| Sẵn sàng tốn $5-30/video paid (Veo3 đắt nhất)? | → P0-E | → chỉ P0-D (Imagen rẻ hơn) |
| Có project Google Cloud sẵn? | → P0-E nhanh | → +30 phút setup project |
| Free trial $300 còn? | → an toàn test | → cẩn thận budget |

### Cost estimate per video (1 phút, 8 scenes 8s)

| Stack | Cost | Quality |
|---|---|---|
| Free (Gemini + Pexels + slideshow + edge-tts) | $0 | Mức chấp nhận được, ảnh không khớp scene |
| Mixed: Gemini Pro + Imagen Fast + slideshow + ElevenLabs | ~$0.50 | Tốt, ảnh chính xác, voice cảm xúc |
| Full paid: Gemini Pro + Imagen Ultra + Veo3 + ElevenLabs | ~$25-40 | Production-grade |

### Recommendation

- **Mới bắt đầu / proof-of-concept**: Free path. Sprint dừng tại P0-A/B.
- **Channel có view, ROI tích cực**: Mixed (Imagen Fast + slideshow + ElevenLabs). Sprint thêm P0-D, skip P0-E.
- **Production / cinematic kênh kể chuyện**: Full paid. Làm cả P0-D + P0-E.

→ **Sau khi user trả lời**: chọn 1 trong 3 path, làm tasks tương ứng.

---

## P0-D. Wire-up Imagen vào n8n workflow (1.5h) — contingent P0-C

### Context
Hiện [n8n workflow 02 "Code - Build Manifest"](../video-content-engine/n8n_workflows/02_scene_generation.json) hard-code `image_url: 'https://picsum.photos/seed/...'`. Worker tải URL này về làm ảnh scene.

Để dùng Imagen: cần n8n gọi API Imagen TRƯỚC khi build manifest, lưu URL ảnh thật vào manifest, worker tải URL Imagen về.

### Acceptance criteria
Render 1 video → mỗi scene có ảnh được sinh bởi Imagen (không phải picsum). Verify bằng cách open ảnh xem có khớp prompt không.

### Steps

1. **Thêm IMAGE API key vào DB** qua UI `/api-sources`:
   - Provider: `google`
   - Type: `IMAGE`
   - Key: cùng API key Gemini hoặc Google Cloud API key có Imagen enabled
   - Click "Test" → expect HealthBadge OK

2. **Sửa workflow 02**:
   - Sau node "Code - Split Scenes", thêm 1 node mới **"HTTP - Generate Image (Imagen)"**:
     ```
     URL: https://generativelanguage.googleapis.com/v1beta/models/imagen-4-fast:generate?key={{ ... }}
     Body: { prompt: $json.scene.image_prompt, aspect_ratio: $json.scene.aspect_ratio || '16:9' }
     ```
   - Hoặc dùng node "Code" gọi qua fetch để tận dụng key rotation BE
   - Output node này có `image_url` thật (Imagen trả URL CDN hoặc base64)

3. **Sửa node "Code - Build Manifest"**:
   - Thay `image_url: 'https://picsum.photos/seed/' + sceneId + '/' + imgSize` bằng `image_url: scene.imagen_url` (từ output Imagen)
   - Fallback nếu Imagen fail: `image_url: scene.imagen_url || ('https://picsum.photos/seed/' + sceneId + '/' + imgSize)`

4. **Re-import workflow vào n8n + restart:**
   ```bash
   docker exec vca_n8n n8n import:workflow --input=/home/node/workflows/02_scene_generation.json
   docker exec vca_n8n n8n update:workflow --id=8Ecv59mtxeW1bjDi --active=true
   docker restart vca_n8n
   ```

### Verify
- Submit 1 video → wait done → open `/projects/[id]/videos/[vid]` → click scene → xem ảnh
- Ảnh phải khớp prompt (vd: "old wooden cabin in autumn forest") không phải random picsum
- Worker logs: `Downloaded image from https://...storage.googleapis.com/...` (Imagen) thay vì `picsum.photos`

### Gotcha
- Imagen Fast cần Google Cloud project với Generative AI API enabled
- Per request có thể trả URL hoặc base64 image — worker phải handle cả 2
- Rate limit Imagen: ~10 req/min free tier, ~60 req/min paid → 8 scenes × N videos cùng lúc có thể bị throttle
- Aspect ratio: Imagen Fast 1:1 default; cần pass `aspect_ratio` để được 16:9/9:16

---

## P0-E. Wire-up Veo3 + Vertex AI credentials (2h) — contingent P0-C

### Context
[veo3_generator.py](../video-content-engine/worker/veo3_generator.py) đã có code dùng `google-genai` SDK. Đang chờ `GOOGLE_API_KEY` env + `VIDEO_PROVIDER=veo3` để activate.

### Acceptance criteria
Render 1 video → mỗi scene có video clip thật từ Veo3 (animation 5-10s) thay vì slideshow Ken Burns trên ảnh tĩnh.

### Steps

1. **Setup Google Cloud project** (nếu chưa):
   - https://console.cloud.google.com → Create Project
   - Enable APIs: "Generative Language API", "Vertex AI API"
   - Billing: gắn credit card hoặc dùng free trial $300
   - Xem chi tiết [docs/setup-vertex-ai.md](setup-vertex-ai.md)

2. **Tạo API key**:
   - Console → APIs & Services → Credentials → Create API Key
   - Restrict: chỉ Generative Language API + Vertex AI

3. **Add VIDEO key vào DB** UI `/api-sources`:
   - Provider: `google`
   - Type: `VIDEO`
   - Key: từ bước 2
   - Test → HealthBadge OK

4. **Update env vars** trong [docker-compose.yml](../docker-compose.yml) hoặc `.env`:
   ```env
   VIDEO_PROVIDER=veo3
   GOOGLE_API_KEY=<từ DB hoặc env>  # worker đọc env trực tiếp, không qua BE rotation
   ```

5. **Worker pickup key qua BE rotation** (alternative cleaner):
   - Hiện `veo3_generator.py:33` đọc `os.getenv("GOOGLE_API_KEY")` trực tiếp
   - Có thể sửa để gọi `GET /api-keys/internal/active?capability=VIDEO` qua BE (như n8n đang làm)
   - Lợi: rotation + tracking quota
   - Effort: +30min

6. **Restart worker:**
   ```bash
   docker compose up -d python_worker
   ```

### Verify
- Submit 1 video 4 scenes 8s mỗi scene = ~32s tổng
- Theo dõi `/jobs` — render time sẽ TĂNG đáng kể (Veo3 mất ~5-10 phút/scene paid tier)
- Tải master mp4 → mỗi scene là animation thật (camera motion, characters move) không phải ảnh zoom
- Check cost: `curl /api/v1/api-keys | jq '.[] | select(.type==\"VIDEO\") | .quotaUsed'` — tăng theo số scene

### Gotcha — ⚠️ COST WARNING
- **Veo 3 ~$0.50/sec** → 1 video 1 phút × 60s = ~$30. **CẦN PHẢI** test với 1 video ngắn trước (3 scenes × 5s = $7.50)
- Có **quota cap** mặc định trên Google Cloud project — 100 video/day cho free trial
- Free Generative Language API **không** include Veo3 — phải bật billing
- Veo3 hiện ở **preview** tại 1 vài region (us-central1) — check availability
- Tránh accidental render: tạm thời `isActive=false` cho VIDEO key, chỉ bật khi test có chủ đích

---

## P0-F. (Optional) Per-project BGM config UI (2h) — không strictly P0

### Context
Hiện BGM cấu hình qua env global. User có 5 project (vd: kể chuyện ma + lifestyle + tin tức) không thể đặt mỗi project 1 vibe nhạc khác.

### Acceptance criteria
- UI: vào project settings → tab "BGM" → upload custom mp3 OR chọn từ library bundled OR tắt BGM
- DB: lưu vào `Project.bgmPreference Json`
- Worker: đọc Project.bgmPreference trước khi fallback global

### Steps (tóm tắt — không cần code chi tiết v1)
1. Schema migration: thêm `Project.bgmPreference Json?` { source: 'bundled'|'custom'|'none', file?: 'calm.mp3' }
2. BE endpoint: `PATCH /projects/:id` đã hỗ trợ partial update
3. FE: thêm card "Nhạc nền" trong project settings, có file upload + select
4. Worker: `_ensure_bgm` đọc `project.bgmPreference` từ DB trước fallback env

→ Đẩy về roadmap P2 hoặc P3 nếu sprint hết thời gian.

---

## Sau khi xong sprint

- [ ] Update [11-feature-checklists.md](11-feature-checklists.md):
  - BGM step `[x]` (nếu P0-A pass)
  - Image `[~]` → `[x]` nếu wire-up Imagen (P0-D)
  - Video `[~]` → `[x]` nếu wire-up Veo3 (P0-E)
  - Decision Vertex `[x]` mặc định (đã quyết định)
- [ ] Update Summary table count
- [ ] Document decision Vertex AI trong CLAUDE.md hoặc memory cho future sessions
- [ ] **NOT** delete sprint file ngay — giữ làm reference vì có cost/credential setup quan trọng
- [ ] `git commit` với message rõ ràng (`feat: BGM verification + Imagen wire-up + Veo3 setup`)

## Decision tree

```
P0-C? (Vertex AI paid?)
├── NO  → chỉ P0-A (verify) + P0-B (optional bundle CC0)  [~1-2h]
├── YES, low budget → P0-A + P0-D (Imagen only)  [~3h]
└── YES, full → P0-A + P0-D + P0-E (Imagen + Veo3)  [~5-7h]
```

## Liên quan

- [11-feature-checklists.md](11-feature-checklists.md) — checklist tổng
- [setup-vertex-ai.md](setup-vertex-ai.md) — chi tiết setup Vertex AI từng bước
- [setup-api-keys.md](setup-api-keys.md) — hướng dẫn lấy API key từng provider
- [05-pipeline.md](05-pipeline.md) — context luồng pipeline để hiểu BGM/Imagen/Veo3 fit vào đâu
- [08-roadmap.md](08-roadmap.md) — Phase 3 có nhắc Veo3 + asset quality
