# 🐕 Dog Psychology Content Engine v2.0 — Bản Hoàn Thiện

**Phiên bản:** 2.0.0
**Mục tiêu:** Tự động hóa hoàn toàn quy trình sản xuất video storytelling dài 18 phút về tâm lý học loài chó (2 video/tuần) cho YouTube và TikTok.
**Output:** File `Private Draft` trên YouTube và TikTok kèm đầy đủ Metadata.

---

## 1. Kiến Trúc Hệ Thống (System Architecture)

Hệ thống hoạt động theo mô hình **Micro-services / Event-driven**, bao gồm các module chính được điều phối bởi n8n:

```mermaid
graph TB
    subgraph "🎯 TRIGGER LAYER"
        CRON["⏰ Schedule Trigger<br/>T3 & T6, 02:00 AM"]
        MANUAL["👤 Manual Trigger<br/>Chạy tay khi cần"]
    end

    subgraph "🧠 BRAIN LAYER (n8n)"
        CAL["📅 Content Calendar<br/>Check trùng + Seasonal"]
        TOPIC["💡 Topic Generator"]
        SCRIPT["✍️ Script Writer<br/>3000-3500 từ"]
        QA["🔍 QA Gate<br/>Score ≥ 75"]
        BREAK["🎬 Scene Breakdown<br/>~135 scenes × 8s"]
    end

    subgraph "🎨 ASSET LAYER (Parallel)"
        CHAR["🐕 Character Sheet<br/>Anchor Images"]
        IMG["🖼️ Image Gen<br/>GPT-image-2"]
        VID["🎥 Video Gen<br/>Runway Gen-4 Turbo"]
        VOICE["🎙️ Voiceover<br/>ElevenLabs"]
        THUMB["📸 Thumbnail Gen<br/>3 variants for A/B"]
    end

    subgraph "🔧 WORKER LAYER (Python)"
        RENDER["🎞️ FFmpeg Render"]
        SUB["📝 Subtitle Gen"]
        SHORT["✂️ TikTok Cutter<br/>3 clips × 60s"]
    end

    subgraph "📤 DISTRIBUTION LAYER"
        YT["▶️ YouTube Upload<br/>Private Draft"]
        TT["🎵 TikTok Upload<br/>Draft"]
        SEO["🔎 SEO Metadata"]
        NOTIFY["📱 Telegram Alert"]
    end

    subgraph "📊 MONITORING"
        COST["💰 Cost Tracker"]
        DASH["📈 Dashboard"]
        DB[(PostgreSQL)]
    end

    CRON --> CAL
    MANUAL --> CAL
    CAL --> TOPIC --> SCRIPT --> QA
    QA -->|"≥ 75"| BREAK
    QA -->|"< 75"| NOTIFY
    BREAK --> CHAR
    CHAR --> IMG & VID
    BREAK --> VOICE
    IMG & VID & VOICE --> RENDER
    RENDER --> SUB --> SHORT
    RENDER --> THUMB
    RENDER --> SEO
    SUB --> YT
    SHORT --> TT
    SEO --> YT
    THUMB --> YT
    YT & TT --> NOTIFY
    
    IMG & VID & VOICE --> COST
    COST --> DB
    DB --> DASH
```

---

## 2. Các Module Chính Trọng Tâm

### 2.1 📸 Thumbnail Generator (CRITICAL)
- **Hoạt động:** Trích xuất 3 keyframe ấn tượng nhất (climax, emotional peak, hook). Gọi GPT-image-2 tạo 3 variants (ví dụ: Close-up emotion, Before/After, Text overlay). Thêm chữ overlay tự động qua Python Pillow.
- **Tích hợp:** Upload 3 variants lên YouTube để A/B test.

### 2.2 🐕 Character Consistency System (CRITICAL)
Với 135 scenes, nhân vật chó cần đồng nhất. Dùng giải pháp 3 tầng:
1. **Character Sheet (GPT-image-2):** Tạo reference sheet (các góc mặt) cho nhân vật chính ở đầu video.
2. **DNA Prompt:** Chuỗi JSON mô tả cố định, được nối vào **mọi** prompt image/video.
3. **Frame Chaining:** Dùng frame cuối của scene N làm reference image cho scene N+1.

### 2.3 ✂️ TikTok / YouTube Shorts Repurpose
- **Hoạt động:** AI lọc ra 3 đoạn script có độ tương tác cao nhất (45-60s). Python Worker cắt video dọc (9:16), chèn hardsub phong cách TikTok (highlight từng từ) và auto-upload dạng Draft lên kênh TikTok.

### 2.4 💰 Cost Tracking & Budget Control
- Ước tính chi phí một video 18 phút là **~$67-79/video** (trong đó Runway Video Gen chiếm ~70%).
- Node "Cost Calculator" tính dồn tổng chi phí realtime trong n8n. Nếu vượt ngưỡng `BUDGET_LIMIT`, tự động pause flow và báo Telegram.

---

## 3. Pipeline Chi Tiết v2.0

### Phase 0: Content Calendar Check
1. Query DB: Kiểm tra cosine similarity các topic đã làm. Tránh trùng lặp.
2. Nạp thêm data các sự kiện theo mùa (Seasonal Events) tạo topic phù hợp.

### Phase 1: Pre-production (Kịch Bản)
1. **Trigger:** Chạy Cronjob tự động (02:00 AM T3, T6).
2. **Topic & Script:** Tạo topic SEO, viết kịch bản 3000-3500 từ (Hook -> Tension -> Climax -> Lesson). Có thêm tag `tiktok_highlights[]`.
3. **QA Gate:** Trí tuệ nhân tạo (OpenAI) tự chấm điểm. Score < 75 -> Báo Telegram. Score >= 75 -> Phase 2.

### Phase 2: Breakdown & Character Setup
1. **Character Init:** Tạo Character Sheet (ảnh tham chiếu).
2. **Breakdown:** Cắt script thành ~80-135 scenes, đính kèm DNA Prompt và Image Reference. Lưu trạng thái `pending` vào PostgreSQL.

### Phase 3: Asset Generation (Chạy Batch)
1. **Audio/Video Gen:** Gọi API ElevenLabs, Runway Gen-4 Turbo, OpenAI (GPT-image-2).
2. **Cost Logging:** Mỗi API call lưu log vào bảng `cost_log`. Cập nhật trạng thái scene thành `completed`.

### Phase 4: Render & Assembly (Hậu Kỳ)
1. Trigger Worker Python để ghép âm thanh và video.
2. Dùng FFmpeg/MoviePy để render master video, auto-ducking nhạc nền, hardsub.
3. Xuất Thumbnail (3 variants) và TikTok clips (3x 60s).

### Phase 5: Distribution (Phân Phối)
1. Cấu hình SEO Metadata.
2. Upload Google API (YouTube - Private) + TikTok API (Draft).
3. Push Notification Telegram: Báo chi phí, link review, 3 preview thumbnails.
4. Clean folder `assets_temp`.

---

## 4. Cấu trúc Repository Code (Project Structure)

```text
dog-psychology-engine/
│
├── .env                     # Chứa API Keys (Không push lên Git)
├── docker-compose.yml       # Setup n8n, Postgres và Python Worker
│
├── n8n_workflows/           # Chứa file JSON export từ n8n
│   ├── 01_idea_and_script.json
│   ├── 02_scene_generation.json
│   └── 03_render_and_upload.json
│
├── prompts_library/         # Tài sản sở hữu trí tuệ (IP)
│   ├── master_story_framework.md
│   ├── character_dna_template.json
│   └── qa_scoring_schema.json
│
├── worker/                  # Cụm xử lý Video (Python)
│   ├── requirements.txt
│   ├── main_server.py       # API nội bộ lắng nghe lệnh từ n8n
│   ├── video_assembler.py   # Code MoviePy/FFmpeg ghép scene
│   ├── tiktok_cutter.py     # Cắt video 9:16 + Hardsub
│   ├── thumbnail_gen.py     # Add text overlay vào keyframe
│   └── clean_temp.py        # Dọn dẹp RAM/Ổ cứng sau khi render
│
└── assets_temp/             # Thư mục tạm chứa file khi đang chạy
```

---

## 5. Các Biến Môi Trường (.env)

```env
# === CORE ===
NODE_ENV=production
PIPELINE_MODE=draft          # draft | semi-auto | full-auto

# === OpenAI ===
OPENAI_API_KEY=sk-...
OPENAI_TEXT_MODEL=gpt-4.1-mini
OPENAI_IMAGE_MODEL=gpt-image-2

# === ElevenLabs ===  
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL=eleven_multilingual_v2

# === Video Generation ===
VIDEO_PROVIDER=runway        # runway | kling | fal
VIDEO_API_URL=https://api.runwayml.com/v1
VIDEO_API_KEY=...
VIDEO_MODEL=gen4_turbo
SCENE_VIDEO_SECONDS=8

# === YouTube ===
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
YOUTUBE_REFRESH_TOKEN=...
YOUTUBE_PRIVACY_STATUS=private

# === Quality Control ===
MIN_QA_SCORE=75
BUDGET_LIMIT_PER_VIDEO=100   # USD

# === Database ===
DATABASE_URL=postgresql://user:pass@localhost:5432/dog_engine
```

---

## 6. Chiến Lược Xử Lý Lỗi (Error Handling Strategy)

- **API Timeout / 500:** Tự động retry 3 lần với delay tăng dần.
- **Rate Limit (429):** Tạm dừng dựa vào `Retry-After` header.
- **Budget Exceeded:** Khóa toàn bộ pipeline, báo tin nhắn khẩn cấp qua Telegram.
- **n8n / Server Crash:** PostgreSQL lưu trạng thái các scene. Pipeline tự động Resume ngay từ scene bị lỗi, không cần chạy/render lại từ đầu.

---

## 7. Lộ Trình Triển Khai (Roadmap)

- **Tuần 1-2 (Foundation):** Setup Docker, Postgres, config YouTube OAuth2, viết prompt templates.
- **Tuần 3-4 (Asset Pipeline):** Test AI Image (Character consistency), ghép Runway/ElevenLabs vào n8n.
- **Tuần 5-6 (Full Pipeline):** Xây Python Worker (Render + Subtitle + Thumbnail), chạy end-to-end cho 10 video Draft.
- **Tuần 7-8 (Optimization):** A/B Test Thumbnail/Title, tinh chỉnh chi phí, kích hoạt auto-post lên TikTok.