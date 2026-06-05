# CHECKLIST — Pipeline xịn v5.2

> Tasks cho plan đã chốt trong session brainstorm. Source: plan v5.2 (provider-agnostic + Veo3 + character DNA + AI scene planner với rules + manifest validator + Veo3 retry/fallback + UI cost alert + per-scene progress grid).

## Quy ước đánh dấu

- `[ ]` task pending
- `[x] ✅ ~~Task done~~ — **Note:** nhận xét sau khi hoàn thành` (gạch ngang + tick xanh + comment để save memory)
- Chỉ đánh dấu done sau khi user confirm

---

## Pre-requisites (user setup, blocking)

- [ ] **PRE-1.** Đăng ký Anthropic API key (`sk-ant-api03-...`) + add vào UI `/api-sources` với capability=SCRIPT, provider=anthropic
- [ ] **PRE-2.** Bật billing Google Cloud project + enable Vertex AI API
- [ ] **PRE-3.** Tạo GCP service account với role `aiplatform.user` → download JSON key, đặt vào `secrets/gcp-sa.json`
- [ ] **PRE-4.** Verify Veo3 access (model `veo-3.1-generate-preview` có available trong account)
- [ ] **PRE-5.** Google AI Studio key (`AIza...`) cho Gemini image — đã có, verify còn active

---

## GĐ A — Foundation: Dynamic Provider Routing (1.5 ngày)

**Goal:** Backend resolve providers + decrypted keys, push xuống n8n. Workflow generic HTTP, không hardcode URL.

- [x] ✅ ~~**A.1** Tạo `backend/src/common/provider-registry.ts` — map `provider+model` → `{base_url, auth_header, request_format, response_extract}`~~ — **Note:** 3 entries: anthropic/SCRIPT (claude_messages format), google/SCRIPT (openai_chat compat endpoint), google/IMAGE (gemini_image, URL dùng {model} placeholder). Veo3 + Edge TTS không vào registry (SDK-based). 3 helper fns: `getProviderConfig` (throws NotFoundException nếu sai), `resolveProviderUrl` (expand {model}), `buildAuthValue` (build auth string). GĐ A.3 import trực tiếp.
- [x] ✅ ~~**A.2** Extend `api-key.service.ts` thêm `pickActive(capability, provider?)` lookup multi-provider~~ — **Note:** `pickActive` đã có sẵn (giữ nguyên, caller n8n `internal/active` không vỡ). Thêm `ResolvedProvider` interface + method `resolveProvider(capability, provider?, model?)` mới: DB lookup via `pickActive` + registry lookup via `getProviderConfig/resolveProviderUrl/buildAuthValue` → trả object ready-to-use cho A.3. SCRIPT+IMAGE only; VIDEO/veo3 SDK-based không vào registry. tsc --noEmit: 0 errors.
- [x] ✅ ~~**A.3** Sửa `source.service.ts` (createManual + createYoutube): resolve providers từ project config + fetch keys → push payload `providers: {script, image, video}` xuống n8n~~ — **Note:** Chỉ sửa `createManual` (createYoutube path không push n8n — transcript-fetch queue không có processor). Import `ApiKeyModule` vào `source.module.ts`. Thêm `safeResolve` (bọc try/catch → null nếu provider không có trong registry/không có key). Payload `providers: {script, image, video}` appended additive vào n8n POST body — backward compat với workflow 02 hiện tại. tsc --noEmit: 0 errors.
- [x] ✅ ~~**A.4** Refactor workflow `02_scene_generation.json`: tất cả HTTP node dùng URL/auth/model từ `{{ $json.providers.X }}` thay hardcode~~ — **Note:** Xóa 2 node PULL (`Get Script/Image API Key`). `Code - Validate Input` thêm: validate providers non-null (hard-fail rõ ràng), build `script_request {url, headers, body}` switch `claude_messages` vs `openai_chat`. `AI - Scene Breakdown` dùng `specifyHeaders/Body: json` → dynamic từ `script_request`. `Code - Parse Scenes` thêm `resp.content?.[0]?.text` cho Claude format. `HTTP - Gen Scene Image/Thumbnail` URL dynamic từ `providers.image.url + ?key=authValue`. Connections rewired: ValidateInput→AI (bypass), ParseScenes→SplitScenes (bypass). 0 refs còn lại tới 2 node đã xóa.
- [x] ✅ ~~**A.5** Verify: thay project provider trong AiConfigPanel → tạo video mới → workflow gọi đúng provider mới~~ — **Note:** Backend rebuild cần thiết (A.3 code chưa active). Sau rebuild: exec 4 chạy qua ValidateInput→AISceneBreakdown→ParseScenes→SplitScenes→GenSceneImage — script Gemini openai_chat routing OK. Image fail 404 (model `gemini-2.5-flash-image-preview` đã bị xóa khỏi API) → fixed registry: đổi sang `gemini-2.5-flash-image` (confirm tồn tại qua 429). Image gen tạm thời bị block do key google hết quota image. Negative test (exec 5): set scriptModel=gemini-2.0-flash → hard-fail tại Validate Input với đúng message "providers.script is null" → config gate routing hoạt động đúng. Defer: Claude switch chờ PRE-1; image gen cần key có quota image.
- [x] ✅ ~~**A.6** Re-seed n8n (rm .seeded + restart n8n_init)~~ — **Note:** stop n8n → rm .seeded via one-off container → `docker compose run n8n_init` (import 3 wf + activate) → start n8n. Verify: wf 02 id=8Ecv59mtxeW1bjDi, 12 nodes, active=true, 0 refs tới Get Script/Image API Key. Cảnh báo `update:workflow deprecated` chỉ cosmetic.

---

## GĐ B — Character Library + Gen Endpoint (1 ngày)

**Goal:** User tạo character ở tab riêng → bấm "Generate ảnh" → DALL-E/Gemini sinh → cache DB. Gate trước pipeline.

- [ ] **B.1** Migration `7_add_character_imageurl` — thêm `imageUrl String?` cho `Character` (field `imageKey` đã có, thêm `imageUrl` cho FE display)
- [ ] **B.2** Endpoint `POST /api/v1/characters/:id/generate-image` — fetch image provider key + call API + upload MinIO + update DB
- [ ] **B.3** Endpoint xử lý: edit description → unset imageUrl (báo "cần regen")
- [ ] **B.4** Frontend `CharacterRefSheet.tsx` extend: button "Generate ảnh" trên mỗi card + preview + loading state
- [ ] **B.5** Frontend `lib/api.ts` thêm `generateCharacterImage(characterId)`
- [ ] **B.6** Verify: tạo character → bấm Generate → thấy preview ảnh

---

## GĐ C — UI Inputs (voice_script + quality_mode + character dropdown) (1 ngày)

**Goal:** Form Tạo video có 3 input mới, backward compat.

- [ ] **C.1** Thêm `voice_script: string?` vào FormState — textarea optional, placeholder "Để trống AI sinh"
- [ ] **C.2** Thêm `quality_mode: 'draft' | 'standard' | 'premium'` — select dropdown
- [ ] **C.3** Thêm `character_id: string?` — dropdown từ project library (fetch list characters)
- [ ] **C.4** Quality mode cap sceneCount slider max (Draft=3 / Std=5 / Premium=8 / Hard=10)
- [ ] **C.5** Cập nhật DTO `CreateManualSourceDto` thêm 3 field optional (backward compat)
- [ ] **C.6** Verify: submit form với các combination → BE nhận đủ field

---

## GĐ D — Normalize Input + Voice Script Resolver (1 ngày)

**Goal:** n8n workflow nodes mới: normalize + voice script.

- [ ] **D.1** Workflow node `Normalize Input` — cap sceneCount theo quality_mode (server-side enforcement, defense in depth)
- [ ] **D.2** Workflow node `Voice Script Resolver` — if có voice_script clean nhẹ; else gọi LLM (Claude) sinh từ title+script
- [ ] **D.3** Verify: submit không voice_script → workflow execute log thấy voice_script được AI sinh
- [ ] **D.4** Verify: submit có voice_script → workflow dùng đúng input, không AI sinh

---

## GĐ E — AI Scene Planner refactor với Rules (1 ngày)

**Goal:** Rewrite Scene Breakdown node prompt template — encode 10 rules đã chốt.

- [ ] **E.1** Rewrite prompt: bắt buộc đúng N scene, narration = exact substring, cắt theo câu, cân bằng word count
- [ ] **E.2** Include character_bible + style_bible context vào prompt
- [ ] **E.3** Output schema: `{style_bible, character_bible, scenes[{scene_id, start/end_sec, narration_text, image_prompt, video_prompt, has_character}]}`
- [ ] **E.4** Switch model call sang provider config (qua GĐ A)
- [ ] **E.5** Verify: scene plan ra đúng N, narration ghép = voice_script gốc

---

## GĐ F — Manifest Validator (strict + AI repair) (0.5 ngày)

**Goal:** Validate output Scene Planner trước khi xuống worker.

- [ ] **F.1** Workflow node `Validate Manifest` — check: len(scenes)==N, mọi scene đủ field, narration concat ≈ voice_script (fuzzy 95%), duration trong range
- [ ] **F.2** Workflow node `AI Repair JSON` (conditional) — invalid nhẹ → LLM repair 1x
- [ ] **F.3** Invalid nặng (scene count sai, narration lệch, budget vượt) → fail job với error log rõ ràng
- [ ] **F.4** Verify: mock manifest invalid → validator bắt được + repair OK

---

## GĐ G — Scene Image Gen với Character Reference (1 ngày)

**Goal:** Mỗi scene image gen có character DNA inject.

- [ ] **G.1** Sửa node `Generate Scene Image` prompt: include `character_bible` + `character.imageUrl` reference
- [ ] **G.2** Scene có `has_character: true` → inject character; `false` → skip char ref
- [ ] **G.3** Switch sang provider config (GĐ A) — default Gemini Nano Banana
- [ ] **G.4** Verify: gen ảnh test với character → ảnh có nhân vật giống character DNA

---

## GĐ H — Veo3 Video Gen Wire-up (1 ngày)

**Goal:** `VIDEO_PROVIDER=veo3` thực sự gọi Vertex AI, image-to-video.

- [ ] **H.1** Verify code `veo3_generator.py` hiện có (124 lines) hoạt động đúng — test 1 call mock
- [ ] **H.2** Sửa `asset_downloader.py` branch `if provider == "veo3"` → gọi `veo3_generator.generate()` đúng
- [ ] **H.3** Pass scene image làm `init_image` (image-to-video mode)
- [ ] **H.4** docker-compose mount `secrets/gcp-sa.json` vào python_worker + env `GOOGLE_APPLICATION_CREDENTIALS`
- [ ] **H.5** `.env.example` document yêu cầu setup GCP
- [ ] **H.6** Verify: tạo video qua UI với VIDEO_PROVIDER=veo3 → 1 scene Veo3 thành công

---

## GĐ I — Veo3 Fallback Ken Burns (0.5 ngày)

**Goal:** Veo3 fail → retry 1x transient → fallback slideshow. Pipeline luôn ra master.

- [ ] **I.1** Trong `_generate_video_from_prompt` Veo3 branch: try → catch transient (network/429/503) → retry 1x
- [ ] **I.2** Fail permanent (policy/auth) → KHÔNG retry → fallback ngay
- [ ] **I.3** Fallback Ken Burns: gọi ffmpeg slideshow code đã có
- [ ] **I.4** Mark scene metadata `fallback_used: true` để track
- [ ] **I.5** Verify: force Veo3 fail (bad prompt) → scene đó vẫn ra video Ken Burns

---

## GĐ J — Concurrency + Checkpoint (0.5 ngày)

**Goal:** Veo3 max 3 concurrent + lưu checkpoint scene đã xong.

- [ ] **J.1** Thêm semaphore `max_concurrent_veo = 3` trong python_worker
- [ ] **J.2** Mỗi scene Veo3 xong → upload clip lên MinIO ngay (checkpoint) thay vì đợi cuối
- [ ] **J.3** Verify: tạo video 5 scenes → log thấy max 3 Veo call song song

---

## GĐ K — Cost Guard (FE alert + provider-aware) (1 ngày)

**Goal:** FE alert cost TRƯỚC submit + cost tính theo provider thật.

- [ ] **K.1** BE endpoint `GET /sources/estimate-cost?projectId=X&sceneCount=N&qualityMode=Y` — trả estimated cost
- [ ] **K.2** Refactor `COST_PER_SCENE` flat → function `costPerScene(provider, model)` provider-aware
- [ ] **K.3** FE form create video: hiển thị live "💰 Ước tính ~$X.XX" theo sceneCount + provider
- [ ] **K.4** FE badge đỏ + confirm dialog nếu cost > threshold
- [ ] **K.5** BE pre-flight: nếu actual cost > `BUDGET_LIMIT_PER_VIDEO` → abort với message rõ
- [ ] **K.6** Verify: chọn Premium 10 scenes → UI báo ~$5.5 trước khi bấm Submit

---

## GĐ L — UI Per-Scene Progress Grid (2 ngày)

**Goal:** UI hiện grid N scenes live thay step bar.

- [ ] **L.1** python_worker emit webhook `POST /webhooks/worker/scene-progress` mỗi khi scene state change
- [ ] **L.2** BE socket gateway forward `scene-progress` event xuống FE per video_id
- [ ] **L.3** FE `PipelineProgress.tsx` thay step bar bằng grid N icons (queued/rendering/done/failed)
- [ ] **L.4** Click vào scene icon (sau done) → modal preview clip scene đó
- [ ] **L.5** Estimated time remaining = (scenes_remaining × avg_time)
- [ ] **L.6** Verify: tạo video 5 scenes → UI thấy 5 ô update real-time queued → done

---

## Cleanup & Documentation (sau cuối)

- [ ] **Z.1** Update `Readme.md` mô tả pipeline mới (Veo3, character, quality_mode)
- [ ] **Z.2** Update `docs/05-pipeline.md` reflect flow v5.2
- [ ] **Z.3** Update `docs/11-feature-checklists.md` mark P0 items done
- [ ] **Z.4** Cleanup: xóa `*_import.json` legacy workflow files nếu không dùng
- [ ] **Z.5** Smoke test full E2E: tạo character → tạo video Premium 5 scenes → master.mp4 OK

---

## Metadata

- **Plan version:** v5.2 (chốt session 2026-05-28)
- **Total effort estimate:** ~11 ngày dev (1 dev)
- **Test stack:** Claude (script) + Gemini (image) + Veo3 (video) — but provider-agnostic
- **Out of scope:** Hero/Normal mixing, ElevenLabs voice gen, Grok, multi-character per video, frame chaining, Veo cache, TikTok highlight, auto YouTube upload customization
