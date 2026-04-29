# AI YouTube Content Engine

Engine tự động sản xuất video YouTube cho **bất kỳ niche nào**: bạn cung cấp 1 URL kênh YouTube tham chiếu, hệ thống tự phân tích pattern, lên kế hoạch, viết kịch bản, tạo ảnh + voice + nhạc + subtitle, ghép thành video hoàn chỉnh và upload draft lên YouTube.

## Luồng hoạt động

1. **Bạn nhập URL kênh tham chiếu** + niche + độ dài video mong muốn (15 / 20 phút)
2. **YouTube Data API** fetch dữ liệu thật của kênh: subscribers, top 10 videos, titles, views
3. **GPT** phân tích pattern → tạo topic mới phù hợp niche, không trùng các topic đã làm
4. **GPT** viết kịch bản thô + prompt ảnh cho từng scene
5. **Claude** viết lại kịch bản cho hay (retention + emotion)
6. **GPT QA** chấm điểm 0-100, ≥75 mới qua
7. **GPT** chia kịch bản thành scenes ~8 giây
8. **DALL-E** tạo ảnh cho từng scene
9. **Python Worker** chạy parallel:
   - ElevenLabs voiceover (`eleven_multilingual_v2`)
   - Google Veo 3.1 / Runway Gen-4 Turbo video generation
   - **ElevenLabs Music** BGM instrumental (khớp `core_emotion`, official API)
   - MoviePy ghép master video + audio ducking 15%
   - Tạo SRT subtitle, optional ffmpeg burn-in cho TikTok/Shorts
   - Download DALL-E thumbnail URL → tạo 3 variants với Pillow text overlay
10. **Upload** YouTube (private draft) + Telegram notify

## Yêu cầu

- Docker + Docker Compose v2
- 4 API keys tối thiểu: OpenAI, Anthropic, ElevenLabs, Google AI Studio
- Optional: YouTube OAuth2 (auto-upload), Runway (alternative video), Telegram (notify)

## Cài đặt nhanh

```bash
git clone <repo-url>
cd video-content-engine
cp .env.example .env
nano .env                          # Điền API keys
docker compose up -d --build
```

Mở http://localhost:5678 → tạo admin account → tạo Postgres credential → import 3 file workflow trong `n8n_workflows/` → activate.

**Hướng dẫn deploy chi tiết: xem [deploy.md](./deploy.md).**

## Test nhanh

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

Theo dõi:
```bash
docker compose logs -f python_worker
ls -lh assets_temp/final_output/
```

## Cấu trúc

```text
video-content-engine/
├── docker-compose.yml
├── deploy.md                    # Hướng dẫn triển khai chi tiết
├── init.sql                     # Schema PostgreSQL (auto-apply)
├── .env.example                 # Template env vars
│
├── n8n_workflows/               # 3 workflow JSON
│   ├── 01_idea_and_script.json  # Pipeline chính: channel → topic → script → scenes → images → trigger worker
│   ├── 02_scene_generation.json # Entry thủ công khi đã có script sẵn
│   ├── 03_render_and_upload.json# Webhook callback từ worker (notify + mark published)
│   └── reference_full_pipeline.json # Legacy — bỏ qua
│
├── prompts_library/             # Templates tham khảo (optional)
│
└── worker/                      # FastAPI Python service
    ├── main_server.py           # API /api/v1/render + pipeline orchestration
    ├── video_assembler.py       # MoviePy ghép video + audio ducking + ffmpeg burn-in subs
    ├── asset_downloader.py      # ElevenLabs voiceover + Veo3/Runway video gen
    ├── elevenlabs_music.py      # BGM official API (default music provider)
    ├── suno_client.py           # BGM via Suno (legacy/optional, unofficial endpoint)
    ├── thumbnail_gen.py         # Pillow text overlay (3 variants)
    ├── tiktok_cutter.py         # 9:16 crop + hardsub cho Shorts
    ├── veo3_generator.py        # Google Veo 3.1 video generation
    ├── distributor.py           # YouTube OAuth upload + Telegram
    ├── clean_temp.py            # Cleanup assets sau upload
    └── Dockerfile
```

## Cấu hình niche

Trong `.env`:

```env
CHANNEL_NAME=My Channel
CHANNEL_NICHE=relax music             # Bất kỳ: travel | finance | cooking | self-help | history | ...
CHANNEL_URL=https://www.youtube.com/@channel_to_analyze
CHANNEL_LANGUAGE=Vietnamese           # English | Vietnamese | ...
CHANNEL_VISUAL_STYLE=cinematic, warm tones, 16:9
TARGET_DURATION_MINUTES=15            # 15 | 20 | ...
```

Thay đổi 4 dòng này = engine sản xuất nội dung cho niche khác. **Không cần đổi code**.

## Models defaults (đã verify tháng 4/2026)

| Env var | Default | Nguồn |
|---|---|---|
| `OPENAI_TEXT_MODEL` | `gpt-5.4-mini` | OpenAI Responses API |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2` | OpenAI Images API (size `1536x1024`) |
| `CLAUDE_MODEL` | `claude-opus-4-7` | Anthropic Messages API |
| `ELEVENLABS_MODEL` | `eleven_multilingual_v2` | ElevenLabs TTS |
| `ELEVENLABS_MUSIC_MODEL` | `music_v1` | ElevenLabs Music API (paid) |
| `VEO3_MODEL` | `veo-3.1-generate-preview` | Google Gemini API (3.0-preview deprecated 4/2026) |
| `VIDEO_MODEL` | `gen4_turbo` | Runway (chỉ khi `VIDEO_PROVIDER=runway`) |
| `MUSIC_PROVIDER` | `elevenlabs` | `elevenlabs` \| `suno` (legacy) \| `static` |
| `VIDEO_PROVIDER` | `veo3` | `veo3` \| `runway` |

## Module chính

### Topic generator (channel-aware)
- `Code - Fetch YouTube Channel Data` (workflow 01) gọi YouTube Data API v3 lấy:
  - Channel: subscribers, total views, description
  - Top 10 videos: title, views, likes, comments, tags, duration
- GPT prompt được dạy: "Study title patterns, hooks, topics. Identify what drives retention. Then create ONE NEW topic that fits the same audience and pattern."

### Script refinement
- GPT viết kịch bản thô theo `target_duration_minutes`
- Claude refine để tăng retention + emotional impact
- GPT QA chấm điểm — fail-fast nếu < `MIN_QA_SCORE` (chạy SEQUENTIAL trước Scene Breakdown để không tốn tiền DALL-E khi script bị reject)

### Emotion-aware BGM
- Topic GPT generate `core_emotion` (vd: `melancholic`, `tense`, `uplifting`)
- Worker build prompt động: `"{emotion} cinematic background music, instrumental only, no vocals, documentary style"`
- Default provider: **ElevenLabs Music** (`POST /v1/music`, official, dùng cùng `ELEVENLABS_API_KEY`)
- Suno được giữ làm legacy option (`MUSIC_PROVIDER=suno`) nhưng KHÔNG khuyến khích vì endpoint reverse-engineered
- Fallback `MUSIC_PROVIDER=static` → download `BGM_FALLBACK_URL` (mp3 public)
- Mỗi video có BGM riêng tại `assets_temp/bgm/background_<id>.mp3`

### BGM-video sync (adaptive duration + crossfade)
- BGM duration **tự tính** theo video length: `len(scenes) × scene_seconds × 1.1` (cap 600s API max)
- Override fixed: `BGM_DURATION_MS=N` (ms)
- Video > 10 phút: BGM được loop với crossfade `BGM_CROSSFADE_SEC=2.0` (default) để không bị hard cut

### Audio mixing (3 layers, không replace)
Final video audio = `Voice (100%) + Veo3 native (30%) + BGM (15%)`:
- **Voice (`VOICE_VOLUME=1.0`)**: ElevenLabs voiceover dominant cho narration rõ
- **Veo3 native (`VEO_AUDIO_VOLUME=0.3`)**: Veo 3 sinh ambient + SFX + dialogue → mix subtle để giữ atmosphere
- **BGM (`BGM_VOLUME=0.15`)**: ElevenLabs Music dưới cùng để đẩy emotion
- Set `VEO_AUDIO_VOLUME=0` để hoàn toàn bỏ Veo3 native audio (chỉ giữ voiceover + BGM)

### Image-to-video (visual continuity)
- Workflow tạo DALL-E scene image trước
- Veo 3.1 hỗ trợ `image=...` parameter → pass DALL-E image làm **initial frame** của video
- → Visual của Veo3 video khớp với DALL-E image, scene-to-scene continuity
- Toggle: `USE_IMAGE_TO_VIDEO=true` (default) | `false` để revert text-only mode

### Thumbnail pipeline
- Workflow 01 gọi DALL-E với prompt thumbnail-specific → trả URL
- `Code - Attach Thumbnail` (n8n) attach URL vào manifest
- Worker `_prepare_thumbnail_inputs()` download URL → pass vào `generate_thumbnail_variants()`
- Pillow add 3 text overlays khác nhau (thumbnail_text + 2 SEO keywords) → save 3 file `variant_{1,2,3}.jpg`

### Subtitle modes
- `BURN_SUBTITLES=false` (default) — chỉ tạo `.srt` để YouTube tự upload làm closed caption
- `BURN_SUBTITLES=true` — ffmpeg burn-in chữ trực tiếp vào master video (cần cho TikTok/Shorts vì viewer không bật CC)
- Tuỳ chỉnh style: `SUBTITLE_STYLE` (ASS format)

## Cost ước tính / video 15 phút

| Service | Qty | Cost |
|---|---|---|
| GPT-5.4-mini (topic + script + QA + scenes + SEO) | ~5 calls | ~$1 |
| Claude Opus 4.7 (script refine) | 1 call | ~$0.5 |
| `gpt-image-2` (scene images + thumbnail) | ~111 images @ `1536x1024` | ~$2-5 |
| ElevenLabs voiceover (`eleven_multilingual_v2`) | ~2500 từ | ~$1 |
| Veo 3.1 / Runway Gen-4 Turbo | ~110 × 8s | ~$5-50 |
| ElevenLabs Music BGM (`music_v1`, instrumental, ~120s) | 1 track | ~$0.3 |
| **Total** | | **~$10-60** |

> Veo3 rẻ hơn Runway ~10×. Default `VIDEO_PROVIDER=veo3`.
> ElevenLabs Music yêu cầu paid plan ($22/tháng Creator). Set `MUSIC_PROVIDER=static` nếu chỉ test render.

## Giới hạn đã biết

Xem section 10 của [deploy.md](./deploy.md#10-giới-hạn-đã-biết-sẽ-cải-tiến).

## License

Internal project.
