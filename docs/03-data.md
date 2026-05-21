# 03 — Data Model

Schema gốc: [backend/prisma/schema.prisma](../backend/prisma/schema.prisma). 13 models + 2 enums. PostgreSQL 16.

## ERD

```mermaid
erDiagram
  Project ||--o{ Video        : "1:N"
  Project ||--o{ Frame        : "1:N"
  Project ||--o{ Character    : "1:N"
  Project ||--o{ ApiSource    : "1:N"
  Project ||--o{ ApiKey       : "1:N (nullable - global keys)"
  Video   ||--o{ Scene        : "1:N"
  Video   ||--o{ Job          : "1:N (via videoId)"
  Video   ||--o{ ApiSource    : "1:N"
  Scene   ||--o{ SubtitleLine : "1:N"
  Frame   ||--o{ FrameImage   : "1:N"

  Project {
    string id PK
    string name
    string slug UK
    string language
    string niche
    string visualStyle
    string scriptProvider
    string scriptModel
    string imageProvider
    string imageModel
    string videoProvider
    string videoModel
    string scriptBasePrompt "Custom system prompt for AI"
    string voiceProvider
    string voiceId
    float  voiceSpeed
    bool   burnSubtitles
  }

  Video {
    string id PK
    string projectId FK
    string title
    string status "draft|rendering|done|failed"
    string masterVideoKey "S3 key"
    string thumbnailKey
    float  durationSec
    string youtubeVideoId
    float  totalCostUsd
    string outputMode "master|clips"
    int    targetDurationSec
    datetime publishedAt
  }

  Scene {
    string id PK
    string videoId FK
    int    sceneIndex
    string voiceoverText
    string videoPrompt
    string imagePrompt
    string audioKey "S3 key"
    string videoKey "S3 key"
    string imageKey "S3 key"
    string subtitleKey
    float  durationSec
    string status
    float  costUsd
    string veoJobId
  }

  SubtitleLine {
    string id PK
    string sceneId FK
    int    startMs
    int    endMs
    string text
    string position "top|center|bottom"
    string style "JSON-serialized"
  }

  Frame {
    string id PK
    string projectId FK
    string name
    string description
  }

  FrameImage {
    string id PK
    string frameId FK
    int    sortOrder
    string imageKey "S3 key"
    string prompt
  }

  Character {
    string id PK
    string projectId FK
    string name
    string description "DNA prompt"
    string imageKey "S3 ref image key"
    int    sortOrder
  }

  ApiKey {
    string id PK
    string projectId FK "null = global"
    enum   type "SCRIPT|IMAGE|VIDEO|VOICE|BGM"
    string provider "google|openai|anthropic|elevenlabs|runway|replicate|pexels"
    string keyMasked "...last4"
    string keyHash
    string keyEncrypted "AES-256-GCM"
    int    quotaLimit
    int    quotaUsed
    bool   isActive
    datetime lastTestedAt
    string lastTestStatus "ok|invalid|quota|error"
    string lastTestError
    int    lastTestLatency
  }

  ApiSource {
    string id PK
    string projectId FK
    string videoId FK
    enum   type "YOUTUBE|MANUAL"
    string inputUrl
    string rawScript
    string transcript
    string title
    string channelName
    float  durationSec
    string status "pending|fetching|fetched|sent_to_n8n|failed"
    string errorMsg
    json   metadata "video config: sceneCount, targetDurationSec, aspectRatio"
  }

  Job {
    string id PK
    string bullJobId UK
    string queue "render|transcript-fetch|notify"
    string videoId FK
    string status "queued|active|completed|failed"
    int    progress
    json   payload
    json   result
    string error
    datetime finishedAt
  }

  NotificationLog {
    string id PK
    string projectId FK
    string channel "telegram"
    string videoId
    string message
    string imageUrl
    string status "sent|failed"
    string error
  }

  CostLog {
    string id PK
    string videoId
    string provider
    string operation
    float  costUsd
  }
```

## Bảng tham chiếu nhanh

| Model | Bảng SQL | Cardinality lớn nhất | Indexes chính |
|---|---|---|---|
| `Project` | `Project` | dev: 1-10 | `slug` (unique) |
| `Video` | `videos` (mapped) | dev: 1-1000 | `(projectId)`, `(status)` |
| `Scene` | `scenes` (mapped) | ~10-20 per video | `(videoId)` |
| `SubtitleLine` | `SubtitleLine` | nhiều / scene | `(sceneId)` |
| `Frame` | `Frame` | per project | `(projectId)` |
| `FrameImage` | `FrameImage` | per frame | `(frameId)` |
| `Character` | `Character` | per project | `(projectId)` |
| `ApiKey` | `ApiKey` | 1-30 | `(projectId, type)`, `(provider, isActive)` |
| `ApiSource` | `ApiSource` | 1 per video creation | `(projectId)`, `(inputUrl)` |
| `Job` | `Job` | grows fast (truncate cũ) | `(videoId)`, `(queue, status)`, `(createdAt)` |
| `NotificationLog` | `NotificationLog` | grows | `(projectId)`, `(createdAt)` |
| `CostLog` | `cost_log` (mapped) | grows per scene | `(videoId)` |

## Enum

```prisma
enum ApiKeyType { SCRIPT  IMAGE  VIDEO  VOICE  BGM }
enum SourceType { YOUTUBE  MANUAL }
```

## Notes về thiết kế

- **`Video.masterVideoKey` và các `*Key` field**: lưu **S3 key**, không phải URL (URL có TTL → presign khi cần)
- **`ApiKey.keyEncrypted`**: AES-256-GCM, key derive từ env `ENCRYPTION_SECRET`. `keyHash` dùng cho dedup
- **`ApiKey.projectId == null`**: key global, tất cả project xài chung
- **`Job.videoId` nullable**: không phải job nào cũng gắn video (vd: `transcript-fetch` ban đầu chỉ có sourceId)
- **`Project.scriptBasePrompt`**: tuỳ chọn — null = dùng director template hardcoded trong n8n; có giá trị = override system prompt
- **`Video.outputMode`**: legacy enum cho per-scene clips mode (hiện default `master` luôn — clips là side-effect)
- **Soft delete**: không dùng. Cascade delete cho mọi relation child

## Migrations history

```
backend/prisma/migrations/
├── 0_init
├── 1_add_voice_and_modules
├── 2_add_model_config
├── 3_add_script_base_prompt
└── 4_add_apikey_test_status
```

Mỗi migration tự apply khi backend container khởi động (`npx prisma migrate deploy` trong CMD).
