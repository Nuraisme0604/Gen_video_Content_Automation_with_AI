# 05 — Pipeline Flow

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
  participant LLM as Gemini API
  participant W as Python Worker
  participant S3 as MinIO
  participant TG as Telegram

  U->>FE: Nhập script + cấu hình<br/>(sceneCount, targetDuration, aspectRatio)
  FE->>BE: POST /sources/manual
  BE->>DB: INSERT ApiSource (status=fetched)
  BE->>DB: SELECT Project (niche, language, visualStyle, scriptBasePrompt)
  BE->>N8N: POST /webhook/generate-scenes<br/>{script, scene_count, target_duration_sec,<br/>aspect_ratio, script_base_prompt, ...}
  BE->>DB: UPDATE ApiSource status=sent_to_n8n
  BE-->>FE: 200 {id, status: sent_to_n8n}
  FE-->>U: Hiện PipelineProgress component

  N8N->>N8N: Validate Input<br/>(build director system prompt nếu chưa có override)
  N8N->>BE: GET /api-keys/internal/active?capability=SCRIPT
  BE->>DB: SELECT ApiKey active, ORDER BY quotaUsed ASC
  BE->>DB: UPDATE ApiKey quotaUsed +=1
  BE-->>N8N: {provider, key}
  N8N->>LLM: POST /v1beta/openai/chat/completions<br/>{system, user, model: gemini-2.5-flash}
  LLM-->>N8N: JSON {style_bible, scenes: [...]}
  N8N->>N8N: Parse + Build Manifest<br/>(aspect_ratio, image_size...)
  N8N->>BE: POST /webhooks/n8n/render-request<br/>{episode_id, manifest}
  BE->>DB: UPSERT Video status=rendering<br/>+ INSERT Scenes
  BE->>W: enqueue BullMQ render queue
  BE-->>N8N: 200 OK
  N8N-->>BE: (response to webhook caller — async)

  W->>S3: download character/frame refs (nếu có)
  loop For each scene
    W->>W: Generate image (Imagen/Pexels/DALL-E)
    W->>W: Generate voice (ElevenLabs/edge-tts)
    W->>W: Generate video clip (Veo3/local slideshow)
    W->>S3: Upload image/audio/video
    W->>BE: POST /webhooks/worker/scene-progress<br/>{videoId, sceneIndex, progress, previewUrl}
    BE->>DB: UPDATE Scene status
    BE-->>FE: socket.io emit scene:rendered
    FE-->>U: Update PipelineProgress
  end

  W->>W: Assemble master video<br/>(ffmpeg concat + audio merge + subtitles)
  W->>S3: Upload master mp4 + thumbnail
  W->>BE: POST /webhooks/worker/render-complete<br/>{videoId, masterVideoKey, durationSec, totalCostUsd}
  BE->>DB: UPDATE Video status=done<br/>+ UPDATE ApiSource status=rendered
  BE->>TG: Notify "✅ {title} hoàn thành"
  BE-->>FE: socket.io emit job:complete
  FE-->>U: Hiện nút "Tải video" + thumbnail

  U->>FE: Click preview
  FE->>BE: GET /videos/:id/preview-url
  BE->>S3: presign GET (TTL 1h)
  BE-->>FE: presigned URL
  FE->>S3: stream mp4
```

## Các giai đoạn (stages)

| Stage | Actor | Output | Timeout / SLA |
|---|---|---|---|
| 1. Submit | FE → BE | `ApiSource` row | <1s |
| 2. AI scene breakdown | n8n + Gemini | JSON manifest scenes | 10-30s |
| 3. Build manifest + thumbnail | n8n | manifest payload | 5-10s |
| 4. Render request | n8n → BE → BullMQ | Job queued | <1s |
| 5. Per-scene asset generation | Python worker | Image + voice + video clip per scene | 30s-5min/scene (paid Veo3 ~10min) |
| 6. Master assembly | Python worker (ffmpeg) | Master mp4 + thumbnail | 1-3min |
| 7. Callback + notify | BE → Telegram + Socket.IO | Status update | <1s |

**Auto-fail timeout:** [source.service.ts `markStaleAsFailed`](../backend/src/modules/source/source.service.ts) đánh dấu source `failed` nếu kẹt > 15 phút ở `sent_to_n8n / queued / fetching`.

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

## Failure modes phổ biến

| Triệu chứng | Nguyên nhân | Hành động |
|---|---|---|
| `sent_to_n8n` ≥ 15 phút | n8n workflow chưa active hoặc Gemini chậm | Reimport workflow + check `Quotation` |
| n8n "Get Script API Key" 404 | Chưa có SCRIPT API key active trong DB | Vào `/api-sources` thêm/bật key Google/OpenAI |
| Gemini 400 `API_KEY_INVALID` | Key đã expired/revoked | Test key qua nút `Test` trên `/api-sources`, regenerate ở provider |
| Worker treo / không callback | Veo3 timeout, ElevenLabs quota | Xem `docker logs vca_python_worker` |
| Webhook BE 404 | n8n URL trỏ sai (`python_worker:8000` cũ) | Sửa workflow 01/02 → `http://backend:3001/api/v1/webhooks/n8n/*` |

## Liên quan

- [02-architecture.md](02-architecture.md) — phân chia trách nhiệm
- [04-api.md](04-api.md) — chi tiết các webhook endpoint
- [06-deployment.md](06-deployment.md) — vận hành + troubleshooting
- [video-content-engine/n8n_workflows/](../video-content-engine/n8n_workflows/) — workflow JSON
