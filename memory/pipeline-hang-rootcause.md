---
name: pipeline-hang-rootcause
description: Vì sao pipeline tạo video treo ở sent_to_n8n + các fix đã làm
metadata:
  type: project
---

Triệu chứng: tạo video "báo xong nhưng treo mãi", source kẹt `sent_to_n8n` rồi `failed` sau 15 phút, không log gì trên UI.

GỐC RỄ (đã xác nhận qua worker validation log): **n8n chạy bản workflow trong SQLite của nó (`/home/node/.n8n/database.sqlite`), KHÔNG phải file `video-content-engine/n8n_workflows/02_scene_generation.json` trên disk.** Bản trong DB ĐÃ CŨ:
- Gửi scene field tên `narration_excerpt`, nhưng worker `RenderScene` đòi `narration_text` → worker `/api/v1/render` trả **422** → không render → không callback → kẹt.
- Dùng ảnh placeholder `picsum.photos/seed/...` thay vì Gemini sinh ảnh khớp nội dung.
- n8n gọi THẲNG worker `http://python_worker:8000/api/v1/render` (KHÔNG qua backend `/webhooks/n8n/render-request` như tài liệu architecture.md).

FIX đã làm (worker, robust — không cần re-import n8n):
- `main_server.py` RenderScene: `narration_text` optional + thêm `narration_excerpt` + `model_post_init` map excerpt→text (chấp nhận cả workflow cũ lẫn mới). RenderManifest: `narration_script/thumbnail_text` default '', `seo_keywords` default [].
- `main_server.py`: thêm `@app.exception_handler(RequestValidationError)` log chi tiết 422 (trước đây worker im lặng → khó debug; đúng phàn nàn "chả thấy log").
- `storage.py`: thêm `download_file(key, local_path)`.
- `video_assembler.py`: `_ensure_local()` — videoKey/audioKey trong DB là S3 key; nếu clip local đã bị dọn thì tải từ MinIO về trước khi ghép master (trước đó coi S3 key như local path → "Không load được clip" → không có master video).

KẾT QUẢ: pipeline chạy end-to-end ra master.mp4 (test: 3 scenes, 23.4s, upload `s3://assets/videos/{id}/master.mp4`). status=rendered.

Endpoint tạo video: `POST /api/v1/sources/manual`. DB: postgres user=user db=content_engine; bảng tên thường (`scenes`), KHÔNG có bảng `Video`/`Scene` viết hoa.

=== ĐỢT 2 (4 vấn đề chất lượng video) ===
Đã fix thêm:
- #4 SUB: BE n8n.controller inject `manifest.burn_subtitles` từ project.burnSubtitles; worker `burn_subtitles_into_video(force=...)`; RenderManifest.burn_subtitles. (Trước: worker chỉ đọc env BURN_SUBTITLES → project setting không tới worker.)
- #3 THỜI LƯỢNG HÌNH = VOICE: asset_downloader `_audio_duration()` (ffprobe) → slideshow `-t`/zoompan dùng voice duration; lưu scenes.durationSec; generate_subtitles cộng dồn durationSec thật (thay 8s cố định).
- bucket public-read: storage.ensure_bucket() giờ LUÔN set policy (idempotent) — fix "không xem được video" (403). Local/per-machine nên public OK.
- #2 + verbatim: re-import workflow 02 vào n8n (Gemini image, bỏ picsum). Re-import: `docker cp file vca_n8n:/tmp/wf.json` + `MSYS_NO_PATHCONV=1 docker exec vca_n8n n8n import:workflow --input=/tmp/wf.json` + `update:workflow --id=8Ecv59mtxeW1bjDi --active=true` + `docker restart vca_n8n` (import luôn DEACTIVATE → phải activate + restart). n8n chạy bản trong DB, KHÔNG phải file.
- Vô hiệu hóa verbatim check trong node "Code - Validate Manifest" (similarity<0.70 fatal) → cho phép AI viết kịch bản từ ý tưởng (không cần copy verbatim). Sửa file workflow rồi re-import.

#1 (không dấu): KHÔNG phải bug — do input test không dấu; verbatim check làm input CÓ DẤU fail (Gemini paraphrase tiếng Việt → similarity thấp). Đã bỏ verbatim.

BLOCKER MÔI TRƯỜNG (không phải code): **Gemini free-tier IMAGE gen rate-limit 429** ("Try spacing your requests out") khi sinh nhiều ảnh/scene. Workflow cũ né được vì dùng picsum. Lựa chọn: tăng "Wait - Image API Cooldown" trong workflow / đổi image provider (Pexels stock free) / tài khoản Gemini quota cao / giảm sceneCount. n8n execution xem qua sqlite: `execution_entity` (status), `execution_data` (data JSON flatten — parse json.loads rồi deref string-index để lấy error message).
