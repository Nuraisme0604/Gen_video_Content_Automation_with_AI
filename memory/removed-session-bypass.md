---
name: removed-session-bypass
description: Đã gỡ toàn bộ luồng gemini_session (cookie bypass) — chỉ giữ luồng API key hợp lệ
metadata:
  type: project
---

User bị Fable safeguard flag (chuyển sang Opus 4.8) khi làm luồng "surf on browser" — đăng nhập tài khoản Gemini qua cookie để né API (vi phạm ToS Google). User yêu cầu **gỡ toàn bộ phần tà đạo này**, CHỈ giữ luồng video generator bằng **API key hợp lệ**.

ĐÃ GỠ (provider `gemini_session` + browser session, end-to-end):
- worker: xóa `gemini_login.py`, `gemini_session_generator.py`, `gemini_session_http.py`; gỡ nhánh `gemini_session` trong asset_downloader; gỡ 2 endpoint `/api/v1/gemini-session/{chat,image}` + cost `gemini_session` trong main_server; gỡ `gemini-webapi` + pin pydantic 2.12.5 trong requirements; gỡ comment gemini-webapi trong Dockerfile; gỡ test session (test_fallback.py, test_manifest_contract.py).
- backend: gỡ 2 entry `gemini_session` (SCRIPT+IMAGE) trong provider-registry.ts; gỡ `resolveKeyless` + `upsertGeminiSession` + import ApiKeyType không dùng + case testKey trong api-key.service.ts; gỡ endpoint `POST /api-keys/session` trong controller; gỡ VIDEO_COSTS.gemini_session + nhánh resolveKeyless trong source.service.ts.
- frontend: gỡ card "Kết nối tài khoản Gemini" + biến geminiSession/geminiConnected trong api-sources/page.tsx; gỡ gemini_session khỏi SUGGESTED_MODELS/MODEL_NOTES/PROVIDER_LABELS + sessionConnected + availableProviders trong AiConfigPanel.tsx.
- infra/docs: gỡ GEMINI_1PSID/GEMINI_1PSIDTS trong docker-compose + .env; gỡ §4.4 + dòng bảng tính năng trong Readme.md; gỡ 'gemini_session' khỏi allow-list ảnh trong n8n workflow 02 (re-import + activate). Xóa memory video-session-providers.md.

GIỮ NGUYÊN (hợp lệ): Gemini API (script/image), Veo3 API (video), slideshow, Pexels, OpenAI, Anthropic, Runway, edge-tts. + các fix pipeline hợp lệ (nhịp theo voice, sub burn, bỏ nhạc DISABLE_BGM, fallback picsum khi image quota, tải clip S3 khi ghép master, voice retry). Xem [[pipeline-hang-rootcause]].
