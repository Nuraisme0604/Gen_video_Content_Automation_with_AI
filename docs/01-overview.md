# 01 — Overview

> **TL;DR:** Hệ thống tự động sinh video YouTube từ ý tưởng/URL/script bằng AI multi-provider, có UI quản lý dự án + queue + key.

## Mục tiêu sản phẩm

Cho phép một người dùng tự sản xuất video kể chuyện / tin tức / giải trí cho channel của họ mà:
- Không cần biết edit video
- Không cần ngồi viết script từ đầu (đầu vào: link YouTube / link báo / truyện ngắn / script tự nhập)
- Không bị khoá vào 1 nhà cung cấp AI (multi-provider: Gemini / GPT / Claude / Veo3 / Imagen / ElevenLabs / Pexels...)
- Kiểm soát được chi phí qua quota per-key + rotation

## Persona chính

Xem [07-ux-design.md § 0 - Định vị & Persona](07-ux-design.md) để có chi tiết đầy đủ về "Hằng" — content creator solo, kênh kể chuyện tiếng Việt.

## Đầu vào → Đầu ra

| Input | Output |
|---|---|
| 🔗 URL YouTube | mp4 video mới (script được rewrite, voice + hình + nhạc khác hoàn toàn) |
| 🔗 URL báo | mp4 video kể lại nội dung báo |
| 📖 Truyện ngắn / file `.txt` | mp4 video kể truyện có cảnh + voice + BGM |
| ✍️ Script tự nhập | mp4 video render theo script |

Mỗi video đầu ra:
- Master video assembled (mp4) — upload MinIO
- Per-scene clips (mp4) — có thể tải riêng từng cảnh
- Thumbnail tự sinh
- (optional) Phụ đề SRT burn-in
- (optional) Auto-upload YouTube

## Stack tóm tắt

- **Backend**: NestJS + Prisma + BullMQ + Socket.IO
- **Frontend**: Next.js 15 App Router + Tailwind + shadcn/ui + TanStack Query
- **Orchestration**: n8n workflows (3 flows: idea→script, scene generation, render→upload)
- **Worker**: Python FastAPI (asset download, video assembly với MoviePy/ffmpeg, voice với ElevenLabs/edge-tts, hình với Imagen/DALL-E/Pexels, video với Veo3/local slideshow)
- **Storage**: PostgreSQL (data), Redis (queue), MinIO (assets)

→ Chi tiết: [02-architecture.md](02-architecture.md)

## Mặc định "free path"

Ngay khi `docker compose up` xong, hệ thống chạy được mà KHÔNG cần API key trả phí:
- Script: Gemini 2.5 Flash (free tier)
- Image: Pexels stock (free)
- Video: local slideshow Ken Burns trên ảnh
- Voice: Microsoft Edge TTS (free)
- BGM: chưa có (cần ElevenLabs Music nếu muốn)

Người dùng có thể nâng cấp từng stage một bằng cách thêm key paid (Veo3 thay cho slideshow, Imagen thay cho Pexels...) → xem [setup-api-keys.md](setup-api-keys.md).

## Tham khảo

- [Readme.md (root)](../Readme.md) — quick start GitHub-facing
- [07-ux-design.md](07-ux-design.md) — design spec đầy đủ
- [08-roadmap.md](08-roadmap.md) — kế hoạch triển khai theo phase
