---
name: video-session-providers
description: Kế hoạch thêm 2 provider video "cắm thẳng tài khoản" (session) né phí API
metadata:
  type: project
---

User muốn né chi phí API Veo (chỉ video tốn tiền; text Gemini có free tier) bằng cách dùng tài khoản subscription qua session, KHÔNG dùng API key. Đợt này làm CẢ HAI provider session cùng lúc.

Hướng đã chốt:
- Đóng gói như **provider module** cắm vào khe `VIDEO_PROVIDER` sẵn có ở `video-content-engine/worker/asset_downloader.py:89` (`_generate_video_from_prompt`), mẫu theo `veo3_generator.py`. KHÔNG dựng framework plugin mới.
- `gemini_session`: cookie reverse-API qua lib `gemini-webapi` (2 cookie `__Secure-1PSID` + `__Secure-1PSIDTS`), gọi HTTP thẳng, KHÔNG cần Playwright/browser. Nhẹ nhất.
- `grok`: Playwright lái grok.com/imagine (chưa có lib cookie phổ biến). Nặng hơn, dễ vỡ UI. Grok Imagine 1.5: 720p, 6-15s, có image-to-video.
- Credential: TÁI DÙNG bảng `ApiKey` + AES-256-GCM + endpoint `/api-keys/internal/active`. `type=VIDEO`, `provider="gemini_session"|"grok"`, nhét cookie/storage_state JSON vào `keyEncrypted`. KHÔNG đổi schema.
- "Là lựa chọn, không bỏ API": giữ `VIDEO_PROVIDER` env làm công tắc; path `veo3/runway/slideshow` giữ nguyên làm fallback.

Rủi ro đã thông báo user: vi phạm ToS → có thể khóa tài khoản (dùng account phụ); session hết hạn cần re-login; Playwright dễ vỡ khi đổi UI; subscription có cap ngày (Gemini Ultra ~5 video/ngày) → bóp video nhiều-scene.

Ngoài scope đợt này (chỉ làm nếu user yêu cầu): dropdown chọn provider per-project trên FE, login hỗ trợ qua noVNC, cron re-validate session.

Login UX đã chốt: hướng B — app 1-click trên máy user (KHÔNG auto-login bằng password vì Google chặn; user tự login tay trong cửa sổ Playwright headful, app tự bắt cookie). noVNC bị loại.

Trạng thái GEMINI đã code (chưa typecheck vì node_modules chưa cài; Python đã compile sạch, docker-compose config OK):
- worker/gemini_session_generator.py: sinh video qua gemini-webapi; cookie lấy từ BE /api/v1/api-keys/internal/active?capability=VIDEO&provider=gemini_session, fallback env.
- worker/asset_downloader.py: thêm nhánh `provider=="gemini_session"` (song song veo3/runway/slideshow, không đụng).
- worker/gemini_login.py: app login chạy trên HOST (Playwright headful, channel=chrome) → POST cookie lên BE /api/v1/api-keys/session. Build .exe: `pyinstaller --onefile --collect-all playwright gemini_login.py`.
- backend api-key.service.ts: upsertGeminiSession (lưu cookie JSON mã hóa vào ApiKey, upsert 1 dòng provider=gemini_session type=VIDEO) + testKey case gemini_session trả ok.
- backend api-key.controller.ts: POST /api-keys/session nhận {psid, psidts, account?}.
- frontend api-sources/page.tsx: card "Kết nối tài khoản Gemini" (trạng thái Đã/Chưa kết nối + 3 bước + nút Kiểm tra lại/Ngắt kết nối).
- docker-compose.yml: passthrough GEMINI_1PSID/GEMINI_1PSIDTS (env fallback).
- requirements.txt: thêm gemini-webapi.

ĐÃ LÀM TIẾP (provider là lựa chọn của USER per-project, không còn phụ thuộc env .env):
- Trước đó worker đọc os.getenv("VIDEO_PROVIDER") → bỏ qua lựa chọn UI. Đã nối lại:
  - BE webhooks/n8n.controller.ts renderRequest: lookup project.videoProvider → gán manifest.video_provider trước khi enqueue render job (KHÔNG đụng n8n JSON).
  - worker main_server.py: RenderManifest thêm field video_provider; scene_args tuple + _download_single_scene truyền xuống.
  - worker asset_downloader.py: _generate_video_from_prompt(provider=...) + download_assets_for_scene(video_provider=...); fallback env nếu None.
  - NAMING: project lưu google/local/runway/gemini_session; worker map alias google→veo3, local→slideshow (vertex→veo3).
  - BE source.service.ts VIDEO_COSTS thêm gemini_session=0 (tránh budget guard chặn nhầm; tài khoản sub = free phẳng).
  - FE AiConfigPanel.tsx: PROVIDER_LABELS{gemini_session:'Tài khoản Gemini (Pro/Ultra)'}, SUGGESTED_MODELS.gemini_session=['gemini-veo'], MODEL_NOTES. Provider gemini_session TỰ xuất hiện trong dropdown video khi có key VIDEO active (availableProviders lọc theo key active).
- Đã rebuild + verify: worker plumbing runtime OK (manifest field, signatures, alias), BE+FE build TS sạch, backend started clean.

CÒN LẠI: GROK (phần B) chưa làm. Chưa test sinh video THẬT với cookie Google thật — 2 điểm chưa chắc trong gemini_session_generator: response.videos có chứa video không, save(path,filename) ghi đúng tên không.
