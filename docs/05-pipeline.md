# 05 — Pipeline Flow v5.2

Luồng E2E tạo 1 video từ script tự nhập (manual). Luồng YouTube tương tự nhưng có thêm bước fetch transcript ở đầu.

## Sequence diagram — Manual flow

```mermaid
sequenceDiagram
  autonumber
  actor U as User (browser)
  participant FE as Next.js FE
  participant BE as NestJS BE
  participant DB as PostgreSQL
  participant N8N as n8n
  participant LLM as Gemini/Claude API
  participant IMG as Gemini Image API
  participant W as Python Worker
  participant S3 as MinIO
  participant TG as Telegram

  U->>FE: Nhập title + script<br/>chọn quality_mode, sceneCount<br/>character (tuỳ chọn), voice_script (tuỳ chọn)
  FE->>BE: POST /sources/manual<br/>{script, sceneCount, qualityMode,<br/>voiceScript?, characterId?}
  BE->>DB: SELECT Project providers (scriptProvider, imageProvider, videoProvider)
  BE->>DB: SELECT ApiKey (decrypt, pick lowest quotaUsed)
  BE->>DB: SELECT Character (nếu characterId có) → character_bible
  BE->>DB: INSERT ApiSource (status=fetched, metadata={sceneCount,...})
  BE->>N8N: POST /webhook/generate-scenes<br/>{script, scene_count, providers:{script,image,video},<br/>voice_script?, quality_mode?, character?}
  BE->>DB: UPDATE ApiSource status=sent_to_n8n
  BE-->>FE: 201 {id, status: sent_to_n8n}
  FE-->>U: Hiện PipelineProgress<br/>grid N ô (queued, xám)

  N8N->>N8N: Code - Validate Input<br/>(cap sceneCount theo quality_mode, build script_request dynamic)

  alt voice_script không có
    N8N->>LLM: HTTP - Generate Voice Script<br/>(Gemini/Claude via providers.script)
    LLM-->>N8N: generated voice_script
  else voice_script có sẵn
    N8N->>N8N: Code - Clean Voice Script (trim/normalize)
  end

  N8N->>LLM: AI - Scene Breakdown<br/>(10 rules: exact N scenes, narration verbatim,<br/>sentence boundary, word balance ±20%)
  LLM-->>N8N: JSON {style_bible, character_bible, scenes:[...]}
  N8N->>N8N: Code - Validate Manifest<br/>(scene count, fields, narration similarity ≥95%)

  opt manifest_repair_needed
    N8N->>LLM: HTTP - AI Repair JSON (1x repair)
    LLM-->>N8N: repaired JSON
    N8N->>N8N: re-validate (fatal nếu vẫn broken)
  end

  N8N->>N8N: Code - Split Scenes (1 item per scene)

  loop For each scene
    N8N->>IMG: HTTP - Generate Scene Image<br/>(Gemini multimodal, inject character DNA nếu has_character)
    IMG-->>N8N: image bytes / URL
  end

  N8N->>N8N: Code - Build Manifest (assemble final payload)
  N8N->>BE: POST /webhooks/n8n/render-request<br/>{videoId, manifest}
  BE->>DB: UPSERT Video status=rendering + INSERT Scenes
  BE->>W: enqueue BullMQ render queue
  BE-->>N8N: 200 OK

  W->>W: Emit queued cho tất cả scenes
  W->>BE: POST /webhooks/worker/scene-progress ×N<br/>{videoId, sceneIndex, status: queued}
  BE->>DB: UPDATE Scene.status
  BE-->>FE: socket.io emit scene-progress → room video:{videoId}
  FE-->>U: Grid: tất cả ô = queued (xám)

  loop ThreadPoolExecutor — parallel per scene
    W->>W: Emit rendering (thread bắt đầu)
    W->>BE: POST /webhooks/worker/scene-progress<br/>{videoId, sceneIndex, status: rendering}
    BE-->>FE: socket.io scene-progress
    FE-->>U: Ô scene = violet + spinner + ETA update

    W->>W: Generate voice (edge-tts / ElevenLabs)
    W->>W: Generate video clip<br/>(Veo3 → retry 1x transient → Ken Burns fallback)
    W->>S3: Upload clip checkpoint<br/>videos/{videoId}/clips/clip_NNN.mp4
    W->>DB: UPDATE Scene videoKey=clip_key

    W->>BE: POST /webhooks/worker/scene-progress<br/>{videoId, sceneIndex, status: done|failed}
    BE->>DB: UPDATE Scene.status
    BE-->>FE: socket.io scene-progress
    FE-->>U: Ô scene = emerald (done) hoặc rose (failed)
  end

  W->>W: Assemble master video (ffmpeg concat + audio)
  W->>S3: Upload master mp4 + thumbnail
  W->>BE: POST /webhooks/worker/render-complete<br/>{videoId, masterVideoKey, durationSec, totalCostUsd}
  BE->>DB: UPDATE Video status=done + UPDATE ApiSource status=rendered
  BE->>TG: Notify "✅ {title} hoàn thành"
  BE-->>FE: socket.io emit job:complete
  FE-->>U: Nút "Xem video"

  opt User click scene icon (done)
    U->>FE: Click scene ô emerald
    FE->>BE: GET /videos/:id/clips
    BE->>DB: SELECT Scenes (videoKey)
    BE-->>FE: [{sceneIndex, clipUrl}]
    FE-->>U: Modal <video autoPlay> preview clip
  end
```

---

## Các giai đoạn (stages)

| Stage | Actor | Output | Timeout / SLA |
|---|---|---|---|
| 1. Submit + provider resolve | FE → BE | `ApiSource` row, providers resolved | <1s |
| 2. Voice script resolver | n8n + LLM | voice_script (generated hoặc cleaned) | 5-15s (nếu AI sinh) |
| 3. AI Scene Breakdown | n8n + LLM | JSON manifest (N scenes, narration verbatim) | 10-30s |
| 4. Manifest validate + repair | n8n | Validated manifest hoặc AI-repaired | 0-20s (repair chỉ khi cần) |
| 5. Image gen per scene | n8n + Gemini Image | Scene images + thumbnail | 5-10s/ảnh |
| 6. Render request | n8n → BE → BullMQ | Job queued, DB scenes inserted | <1s |
| 7. Per-scene video gen | Python worker (parallel) | Clip per scene + MinIO checkpoint | 30s-10min/scene |
| 8. Master assembly | Python worker (ffmpeg) | master.mp4 | 1-3min |
| 9. Callback + notify | BE → Telegram + Socket.IO | Status update | <1s |

**Parallel:** Bước 7 chạy song song với `ThreadPoolExecutor`, tối đa `MAX_CONCURRENT_VEO=3` cho Veo3.

**Auto-fail timeout:** [source.service.ts `markStaleAsFailed`](../backend/src/modules/source/source.service.ts) đánh dấu source `failed` nếu kẹt > 15 phút ở `sent_to_n8n / queued / fetching`.

---

## YouTube flow (khác biệt)

```
FE submit URL
  → BE POST /sources/youtube
  → BE INSERT ApiSource (type=YOUTUBE)
  → BE enqueue BullMQ transcript-fetch
  → Python worker (transcript-fetch consumer):
     - yt-dlp lấy transcript hoặc auto-caption
     - lưu transcript vào ApiSource.transcript
     - gọi BE để trigger n8n workflow 02 với transcript đó
  → từ đây nhập luồng manual (bước 2 trở đi)
```

---

## Failure modes phổ biến

| Triệu chứng | Nguyên nhân | Hành động |
|---|---|---|
| `sent_to_n8n` ≥ 15 phút | n8n workflow chưa active hoặc LLM chậm | Reimport workflow (`docker compose run n8n_init`) + check n8n execution log |
| n8n "providers.script is null" | Chưa có SCRIPT API key active trong DB cho provider đã chọn | Vào `/api-sources` thêm/bật key Google hoặc Anthropic |
| Image gen 429 | Google IMAGE quota hết | Chờ quota reset hoặc dùng key khác |
| Manifest validator fatal | AI trả JSON sai (scene count lệch >2, narration <70% match) | Xem n8n execution log → thường do model thay đổi format; thử lại |
| Scene grid không xuất hiện | `source.metadata.sceneCount` null | Kiểm tra BE log, `sceneCount` phải có trong `videoConfig` khi submit |
| Worker treo / không callback | Veo3 timeout, không có key | Xem `docker logs vca_python_worker`; `VIDEO_PROVIDER=slideshow` để dùng Ken Burns fallback |
| Clip modal hiện "Đang tải" mãi | Scene clip chưa upload MinIO (`videoKey` null) | Worker có thể fail ở bước upload; xem log |
| Webhook BE 404 | n8n URL trỏ sai | Sửa workflow → `http://backend:3001/api/v1/webhooks/n8n/*` |

---

## Liên quan

- [02-architecture.md](02-architecture.md) — phân chia trách nhiệm
- [04-api.md](04-api.md) — chi tiết các webhook endpoint
- [06-deployment.md](06-deployment.md) — vận hành + troubleshooting
- [video-content-engine/n8n_workflows/](../video-content-engine/n8n_workflows/) — workflow JSON
