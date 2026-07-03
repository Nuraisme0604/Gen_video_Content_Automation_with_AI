# PLANNING — Hoàn thiện luồng "Script + Ảnh + Voice → Slideshow Video"

> **Mục tiêu:** biến luồng tạo video kể chuyện (đã chạy được PoC) thành một **tool vận hành ổn định**: nhập ý tưởng/kịch bản → ra video slideshow (ảnh doodle theo phong cách kênh + voice khớp hình + phụ đề), làm được **hàng loạt**, **thấy lỗi rõ ràng**, **sửa lại từng cảnh** khi cần.
>
> **Phạm vi:** CHỈ luồng video slideshow (script→image→voice→ghép). Đây là **scale-up**, không đụng các phần khác của hệ thống (auth, character library nâng cao, YouTube upload, Veo3 API path... giữ nguyên).
>
> **Trạng thái nền (đã có, đang chạy):** pipeline E2E chạy thông — n8n workflow 02 sinh script + tách cảnh + sinh ảnh; worker sinh voice (edge-tts, có retry) + ghép slideshow (ảnh tĩnh, hard cut, thời lượng = voice) + burn phụ đề + upload MinIO (public-read). Style kênh nạp qua `scriptBasePrompt` per-project. Đã gỡ toàn bộ luồng session/cookie (chỉ dùng API key hợp lệ).

---

## 0. Nguyên tắc & cách đọc plan

- Mỗi phase có: **Mục tiêu** → **Chức năng vận hành** (người dùng thấy/làm gì) → **Thay đổi code** (file + hàm + dữ liệu) → **Tiêu chí verify** (theo CLAUDE.md §4).
- Thứ tự phase = thứ tự phụ thuộc. Làm từ trên xuống. **Không nhảy cóc.**
- Mỗi phase độc lập verify được → có thể dừng bất kỳ đâu mà tool vẫn dùng được.
- **Không outscope:** mỗi dòng code phải trace về đúng mục tiêu phase.

---

## 1. Kiến trúc luồng hiện tại (ground truth để bám vào)

```
Người dùng (FE /projects/[id]/create)
  │  nhập title + (tùy chọn) script + sceneCount + qualityMode
  ▼
Backend  POST /api/v1/sources/manual   (source.service.ts createManual)
  │  - đọc Project config (scriptProvider/imageProvider/videoProvider/voice/burnSubtitles/language/scriptBasePrompt)
  │  - resolve provider key (registry) → build payload `providers`
  │  - tạo ApiSource(status=sent_to_n8n)
  ▼
n8n  webhook /generate-scenes  (workflow 02_scene_generation.json)
  │  Validate Input → AI Scene Breakdown (LLM) → Parse/Split Scenes
  │  → Generate Scene Image (Gemini, continue-on-fail → picsum) → Normalize Image
  │  → Build Manifest → Attach Thumbnail
  │  → HTTP POST thẳng worker  http://python_worker:8000/api/v1/render   ⚠️ KHÔNG qua backend
  ▼
Worker (main_server.py process_video_pipeline)
  │  mỗi scene (ThreadPoolExecutor): tải ảnh → voice (edge-tts, retry) → slideshow tĩnh (dur=voice)
  │  → checkpoint clip lên MinIO → persist scenes(durationSec, audioKey, videoKey...)
  │  → assemble master (tải clip S3 nếu cần) → generate SRT → burn sub → upload master.mp4
  │  → callback backend  /webhooks/worker/render-complete
  ▼
Backend cập nhật Video(status=done, masterVideoKey) → Socket.IO → FE hiện video
  │  FE xem qua  GET /videos/:id/preview-url  (public URL localhost:9000)
```

**5 điểm mấu chốt đã phát hiện (plan phải tôn trọng):**
1. **n8n gọi THẲNG worker**, không qua backend → mọi config muốn tới worker phải đi trong **manifest** mà n8n build, KHÔNG thể inject ở backend webhook.
2. **n8n chạy workflow trong DB nội bộ của nó**, KHÔNG đọc file JSON trên disk → sửa workflow phải **re-import + activate + restart**.
3. **Ảnh Gemini phụ thuộc quota** free-tier → hết quota rơi về picsum (ảnh ngẫu nhiên, không đúng nội dung).
4. **edge-tts rate-limit** khi nhiều scene song song → có retry, nhưng vẫn có thể trượt 1 scene.
5. **Lỗi pipeline im lặng**: worker fail (422/exception) → không callback → source kẹt `sent_to_n8n` 15 phút rồi `failed`, không rõ lý do trên UI.

---

## 2. Vấn đề cần đóng để thành "tool dùng được" (khoảng cách hiện tại)

| # | Vấn đề | Ảnh hưởng vận hành | Phase xử lý |
|---|--------|--------------------|-------------|
| A | Ảnh không đúng nội dung khi Gemini hết quota | Video ra ảnh rác (picsum) | Phase 1 |
| B | `burnSubtitles` / `DISABLE_BGM` chỉ đọc từ env, không theo project | Không bật/tắt sub-nhạc per-video được | Phase 2 |
| C | Lỗi im lặng, người dùng không biết vì sao kẹt | Không vận hành được khi có sự cố | Phase 3 |
| D | Không xem/sửa được từng cảnh trước khi hài lòng | Phải render lại cả video khi 1 cảnh hỏng | Phase 4 |
| E | Nhân vật không nhất quán giữa các cảnh | Video doodle trông rời rạc | Phase 5 |
| F | Không làm được hàng loạt (batch) | Không "vận hành" ở quy mô | Phase 6 |
| G | Ngôn ngữ narration cố định theo project | Khó làm đa ngôn ngữ | Phase 2 (kèm) |
| H | Lời thoại chia không đều giữa các cảnh (1 cảnh ôm gấp rưỡi–đôi lượng lời) | 1 ảnh tĩnh treo 20-30s trong khi cảnh khác 13s — nhịp video lệch | Phase 7 |

---

## 3. Mô hình dữ liệu — thay đổi đề xuất (Prisma)

> Nguyên tắc: thêm cột, **không phá cột cũ**. Mỗi cột có default an toàn để migration không vỡ dữ liệu hiện có.

### 3.1 `Project` (bổ sung config vận hành)
```prisma
model Project {
  // ✅ ĐÃ CÓ SẴN (không thêm, không migration):
  //   language        String  @default("vi")
  //   imageProvider   String  @default("pexels")     ← provider ảnh CHÍNH đã là cột project
  //   burnSubtitles   Boolean @default(false)        ← lưu ý: default hiện tại là FALSE
  //   scriptBasePrompt String?                       ← style kênh đã nạp per-project
  // ➕ THÊM MỚI:
  imageFallbackProvider String  @default("pexels")  // Phase 1: provider ảnh dự phòng khi provider chính fail
  disableBgm            Boolean @default(true)      // Phase 2: bỏ nhạc nền per-project (thay env DISABLE_BGM)
  characterRefKey       String?                     // Phase 5: S3 key ảnh nhân vật tham chiếu
}
```

### 3.2 `Scene` (thêm cho review/regenerate)
```prisma
model Scene {
  // ✅ ĐÃ CÓ SẴN: imagePrompt String?, videoPrompt String?, durationSec Float?
  //    → Phase 4 regenerate ảnh dùng thẳng imagePrompt, KHÔNG cần thêm cột này
  // ➕ THÊM MỚI:
  imageProvider String?          // provider thực tế đã tạo ảnh (gemini | pexels | picsum) — Phase 1
  regenCount    Int @default(0)  // Phase 4: số lần regenerate cảnh này
}
```

### 3.3 `Video` (batch)
```prisma
model Video {
  // ✅ ĐÃ CÓ SẴN: stage String? — cột đã tồn tại trong schema.
  //    Phase 3 KHÔNG cần migration cho stage; chỉ cần worker/BE GHI giá trị
  //    ("script" | "images" | "voice" | "assembling" | "done") và FE đọc.
  // ➕ THÊM MỚI:
  batchId String?  // Phase 6: gom nhiều video 1 lần chạy
}
```

### 3.4 Bảng mới `RenderEvent` (Phase 3 — nhật ký lỗi/bước để hiển thị)
```prisma
model RenderEvent {
  id        String   @id @default(cuid())
  videoId   String
  level     String   // "info" | "warn" | "error"
  stage     String   // script | image | voice | assemble | callback
  message   String
  createdAt DateTime @default(now())
  @@index([videoId, createdAt])
}
```

---

## PHASE 1 — Ảnh đáng tin cậy (đóng vấn đề A)

**Mục tiêu:** video luôn có ảnh **liên quan nội dung**, không phụ thuộc quota 1 nhà cung cấp. Không bao giờ ra picsum trừ khi mọi nguồn thật đều chết.

### Chức năng vận hành
- Người dùng chọn provider ảnh chính (Gemini) + hệ thống tự động fallback theo chuỗi khi lỗi/hết quota.
- Chuỗi đề xuất: **Gemini (doodle AI)** → **Pexels (ảnh/B-roll thật theo keyword)** → **picsum (chỉ khi tất cả chết)**.
- UI hiển thị mỗi cảnh dùng nguồn ảnh nào (badge: AI / Stock / Placeholder).

### Thay đổi code
1. **n8n workflow 02** (`02_scene_generation.json`, node "Generate Scene Image" + "Normalize Image"):
   - Node image giữ `onError: continueRegularOutput` (đã có).
   - Trong "Normalize Image": khi ảnh chính (Gemini) trả rỗng → **gọi Pexels** bằng keyword rút từ `image_prompt`/`narration_text` (thêm 1 HTTP node "Pexels Search" hoặc gọi trong code node) → chỉ khi Pexels cũng rỗng mới dùng picsum. Ghi `image_provider` vào scene item.
   - **Lưu ý vận hành:** sửa xong phải re-import: `docker cp ... vca_n8n:/tmp/wf.json` → `n8n import:workflow` → `update:workflow --id=8Ecv59mtxeW1bjDi --active=true` → `docker restart vca_n8n`.
2. **Backend** `provider-registry.ts`: ✅ **đã có sẵn** entry Pexels IMAGE (`provider: 'pexels'`, capability `IMAGE`, endpoint `https://api.pexels.com/v1/search`, `responseExtract: 'photos[0].src'`) — KHÔNG sửa registry. Điều kiện vận hành duy nhất: user đã lưu key Pexels ở trang API Sources.
3. **Backend** `source.service.ts`: truyền `imageFallbackProvider` của project (cột mới §3.1) + resolve key Pexels vào `providers` payload gửi n8n.
4. **Worker** `main_server.py`: nhận `image_provider` trong mỗi scene item của manifest → persist vào cột mới `Scene.imageProvider` (§3.2) lúc persist scenes.
5. **Frontend** `PipelineProgress.tsx`: badge nguồn ảnh mỗi cảnh (đọc `imageProvider`).

### Tiêu chí verify
- Tắt/không có key Gemini → render vẫn ra **ảnh Pexels đúng chủ đề** (không phải picsum).
- Có key Gemini + còn quota → ra ảnh doodle AI.
- DB: `scenes.imageProvider` ghi đúng nguồn thực tế.
- FE: badge nguồn ảnh hiển thị đúng.

---

## PHASE 2 — Config vận hành tới đúng worker (đóng vấn đề B, G)

**Mục tiêu:** `burnSubtitles`, `disableBgm`, `language` do **project quyết định**, không còn phụ thuộc biến env toàn cục. (Vì n8n gọi thẳng worker → phải đi qua manifest.)

### Chức năng vận hành
- Trong trang cấu hình project: bật/tắt **phụ đề cháy vào video**, bật/tắt **nhạc nền**, chọn **ngôn ngữ narration**.
- Mỗi video render đúng theo cấu hình project tại thời điểm submit.

### Hiện trạng đã verify (làm ít hơn tưởng)
- ✅ Worker `RenderManifest` **đã có** field `burn_subtitles: Optional[bool]` (main_server.py:104).
- ✅ Worker **đã nối** `burn_subtitles_into_video(str(video_id), force=bool(manifest.burn_subtitles))` (main_server.py:383) và `burn_subtitles_into_video(..., force)` đã có tham số `force` (video_assembler.py). → **Phía worker cho SUB đã xong, không đụng.**
- ✅ Backend **đã gửi** `language: project?.language` trong payload xuống n8n (source.service.ts:202); Validate Input của workflow đã nhận `language`. → **Ngôn ngữ narration đã chạy per-project, chỉ verify lại.**
- ❌ **Mắt xích đứt duy nhất của SUB:** backend CHƯA gửi `burnSubtitles` xuống n8n, và n8n "Build Manifest" CHƯA đặt `burn_subtitles` vào manifest (grep 0 match trong 02_scene_generation.json) → worker luôn nhận `None`.
- ❌ `disable_bgm` chưa tồn tại ở mọi tầng (chỉ có env `DISABLE_BGM` trong docker-compose).

### Thay đổi code (chỉ phần còn thiếu)
1. **Backend** `source.service.ts`: thêm `burnSubtitles` (cột đã có) + `disableBgm` (cột mới §3.1) vào Prisma `select` của project (cạnh `language`, dòng ~105) và vào payload `POST /generate-scenes` (cạnh `language`, dòng ~202).
2. **n8n workflow 02**: "Validate Input" nhận thêm `burnSubtitles`/`disableBgm` từ body → "Build Manifest" đặt `burn_subtitles`, `disable_bgm` vào manifest gửi worker. (Nhớ quy trình re-import + restart — xem §6.)
3. **Worker** `main_server.py`: CHỈ thêm `disable_bgm: Optional[bool] = None` vào `RenderManifest` (bắt chước `burn_subtitles` ngay dòng dưới) + nhánh nhạc nền: `bgm_disabled = manifest.disable_bgm if manifest.disable_bgm is not None else env DISABLE_BGM` — ưu tiên manifest, env làm fallback.
4. **Frontend** `AiConfigPanel.tsx` (hoặc trang project settings): toggle burnSubtitles / disableBgm + dropdown language (PATCH project — endpoint update project đã có).

### Tiêu chí verify
- Project A bật sub + tắt nhạc → video có sub cháy, không nhạc.
- Project B tắt sub + bật nhạc → ngược lại. **Không cần đổi env, không rebuild.**
- Đổi `language=en` → narration ra tiếng Anh; `vi` → tiếng Việt.

---

## PHASE 3 — Nhìn thấy lỗi (đóng vấn đề C)

**Mục tiêu:** không còn "treo im lặng". Mọi bước/lỗi hiện rõ trên UI; người vận hành biết đang ở đâu, hỏng vì gì.

### Chức năng vận hành
- Thanh tiến trình hiển thị **giai đoạn hiện tại**: Đang viết kịch bản → Sinh ảnh (2/5) → Lồng tiếng → Ghép video → Xong.
- Khi lỗi: hiện **thông báo cụ thể** ("Gemini image hết quota, đã dùng ảnh dự phòng", "Voice cảnh 3 thất bại sau 4 lần thử", "n8n workflow lỗi ở bước X").
- Trang "Nhật ký" liệt kê `RenderEvent` theo thời gian cho từng video.

### Thay đổi code
1. **Bảng mới** `RenderEvent` (§3.4) + module Nest `render-event` (create + list theo videoId). Đây là migration DUY NHẤT của phase này (`Video.stage` ✅ đã có cột sẵn — chỉ cần ghi giá trị).
2. **Worker** `main_server.py`: tại mỗi mốc (bắt đầu bước, lỗi voice, fallback ảnh, assemble xong) → POST `/webhooks/worker/render-event` (fire-and-forget, copy pattern `_emit_scene_progress` main_server.py:107) kèm `stage` để backend cập nhật luôn `Video.stage`. Giữ handler validation-error đã thêm để log 422.
3. **n8n workflow 02**: node "Error Trigger" / cuối nhánh lỗi → POST `/webhooks/n8n/pipeline-error` (✅ endpoint đã có sẵn — n8n.controller.ts:125) kèm tên node + message → backend ghi RenderEvent + set Video.status=failed với errorMsg rõ.
4. **Backend** `webhooks`: thêm `/webhooks/worker/render-event` (ghi RenderEvent + update `Video.stage`); enrich `/webhooks/n8n/pipeline-error` hiện có để ghi thêm RenderEvent.
5. **Backend** `source.service.ts` `markStaleAsFailed`: khi đánh fail do timeout, ghi RenderEvent nêu rõ "timeout 15 phút — xem nhật ký n8n".
6. **Frontend** `PipelineProgress.tsx` (✅ component đã có): đọc `Video.stage` + list RenderEvent (qua Socket.IO đã có + REST fallback); hiện timeline + lỗi.

### Tiêu chí verify
- Cố tình bỏ key SCRIPT → FE hiện lỗi rõ "thiếu SCRIPT key", KHÔNG kẹt câm.
- Gemini hết quota → FE hiện "đã fallback ảnh dự phòng", video vẫn xong.
- Mỗi video có nhật ký các bước xem lại được.

---

## PHASE 4 — Xem & sửa từng cảnh (đóng vấn đề D)

**Mục tiêu:** người vận hành duyệt từng cảnh (ảnh + lời + voice), **regenerate riêng 1 cảnh** rồi ghép lại — không phải làm lại cả video.

### Chức năng vận hành
- Sau khi sinh scene (trước hoặc sau render), FE hiện **lưới cảnh**: ảnh + narration + nghe thử voice.
- Mỗi cảnh có nút: **Sinh lại ảnh** (đổi prompt), **Sinh lại voice**, **Sửa lời** (nhập tay).
- Nút **Ghép lại video** dùng các cảnh đã chỉnh → master mới.

### Thay đổi code
1. **Backend** thêm endpoint:
   - `POST /videos/:id/scenes/:index/regenerate-image` (body: prompt tùy chọn) → gọi worker sinh ảnh 1 cảnh.
   - `POST /videos/:id/scenes/:index/regenerate-voice`.
   - `PATCH /videos/:id/scenes/:index` (sửa `voiceoverText`).
   - `POST /videos/:id/reassemble` → worker ghép lại master từ clip/scene hiện có.
2. **Worker** `main_server.py`: tạo MỚI 2 endpoint + hàm (hiện CHƯA tồn tại — đã verify): `render_single_scene(video_id, index, override_prompt?)` (tách logic 1 scene từ `process_video_pipeline`: tải ảnh → voice → clip → upload) và `reassemble(video_id)`. Phần ghép: ✅ `assemble_master_video(video_id)` đã là hàm độc lập tái dùng được (video_assembler.py:30, tự tải clip từ S3 nếu thiếu local) — `reassemble` chỉ cần gọi nó + generate SRT + burn sub + upload + callback.
3. **DB**: dùng `Scene.imagePrompt` (✅ cột đã có, đã được lưu khi render) để regenerate ảnh; `regenCount` (cột mới §3.2) tăng mỗi lần.
4. **Frontend** `PipelineProgress.tsx` (hoặc trang mới `/videos/[id]/review`): lưới cảnh + 4 nút trên; sau reassemble refetch preview.

### Tiêu chí verify
- Sinh lại ảnh 1 cảnh → chỉ cảnh đó đổi, cảnh khác giữ nguyên.
- Sửa lời cảnh 2 → regenerate voice cảnh 2 → reassemble → master mới có lời + độ dài cảnh 2 đổi đúng, cảnh khác không đổi.

---

## PHASE 5 — Nhất quán nhân vật (đóng vấn đề E)

**Mục tiêu:** nhân vật doodle (vd stick figure tóc cam) trông **giống nhau qua các cảnh**.

### Chức năng vận hành
- Người dùng tạo/generate 1 **ảnh nhân vật tham chiếu** cho project (1 lần).
- Mọi cảnh có nhân vật → ảnh sinh ra bám theo tham chiếu đó.

### Thay đổi code
1. **DB** `Project.characterRefKey` (§3.1) — S3 key ảnh tham chiếu.
2. **Backend/n8n**: khi build image request, nếu provider hỗ trợ ảnh tham chiếu (Gemini multimodal) → đính ảnh ref; nếu không → prepend mô tả nhân vật (đã có `character_bible` trong manifest) vào mọi `image_prompt`.
3. **Frontend**: mục "Nhân vật" trong project settings — upload/generate ref, xem trước.

> Ghi chú: repo đã có Character library (`character.service.ts`, `buildDnaPrompt`) — tái dùng, chỉ nối vào luồng slideshow. **Không dựng mới.**

### Tiêu chí verify
- Set ref → render 3 cảnh có nhân vật → nhân vật nhận ra là cùng một (tóc/đầu/màu nhất quán).

---

## PHASE 6 — Vận hành hàng loạt (đóng vấn đề F)

**Mục tiêu:** tạo **nhiều video một lần** (vd 5 chủ đề → 5 video), theo dõi tất cả trên một bảng.

### Chức năng vận hành
- Nhập danh sách title (mỗi dòng 1 video) → hệ thống queue lần lượt (tôn trọng rate-limit ảnh/voice).
- Bảng batch: mỗi video 1 dòng trạng thái (queued/rendering/done/failed) + link xem/tải.
- Chạy tuần tự (không song song) để không đụng quota Gemini/edge-tts.

### Thay đổi code
1. **DB** `Video.batchId` (§3.3).
2. **Backend** `POST /sources/batch` (body: projectId + titles[]) → tạo N source, enqueue **tuần tự** qua BullMQ (✅ hạ tầng đã có: `BullModule.registerQueue({ name: 'render' })` app.module.ts:31, pattern `@InjectQueue` đã dùng ở n8n.controller.ts + source.service.ts — đăng ký thêm queue `batch` hoặc tái dùng, concurrency=1); giữ khoảng cách giữa các job (config `BATCH_INTERVAL_SEC`).
3. **Backend** `GET /videos?batchId=...` (video.service `list` đã có filter, thêm batchId).
4. **Frontend** trang `/batch`: textarea titles + submit + bảng theo dõi (poll/Socket.IO).

### Tiêu chí verify
- Nhập 3 title → 3 video chạy lần lượt, không đụng rate-limit, bảng cập nhật realtime, tất cả ra master.

---

## PHASE 7 — Cân bằng lời thoại giữa các cảnh (đóng vấn đề H)

**Mục tiêu:** không còn cảnh "ôm" lượng lời gấp rưỡi–gấp đôi cảnh khác. Mọi video ra lò có lời thoại các cảnh chênh nhau trong ngưỡng chấp nhận (max/trung bình ≤ ~1.35), và **pipeline không bao giờ fail chỉ vì lệch cân bằng**.

**Chẩn đoán (bằng dữ liệu thật, không phải đoán):**
- Video "bạch tuộc ba tim": 199 / 184 / **354** ký tự — cảnh 3 gấp ~1.9× cảnh 2 → ảnh tĩnh treo 20.4s so với 13.2s.
- Video "cá voi": 460 / 247 / 360 — cũng lệch. Video "ong mật", "chim cánh cụt": chia đều → **Gemini không tuân thủ nhất quán** RULE 5 (word balance ±20%) đã có sẵn trong prompt.
- `Code - Validate Manifest` hiện CHỈ fatal khi sai số cảnh / thiếu narration_text — **không có check cân bằng** → trường hợp này lọt qua, không kích hoạt vòng repair.
- Lưu ý: **ảnh fallback (picsum) KHÔNG phải nguyên nhân** — tách cảnh chạy TRƯỚC sinh ảnh, hai bước độc lập. Ảnh không liên quan chỉ làm hiện tượng dễ nhận ra hơn.

### Chiến lược 3 lớp: Phòng ngừa → Phát hiện + sửa bằng AI → Lưới an toàn cục bộ

**Lớp 1 — Phòng ngừa (prompt, giảm tần suất lỗi ngay từ đầu):**
- `Code - Validate Input`: thay RULE 5 chung chung bằng **ngân sách từ cụ thể cho mỗi cảnh**, tính sẵn bằng số: khi có script → `totalWords/N ±20%` (ghi số cụ thể, vd "mỗi cảnh 40–60 từ"); khi AI viết từ ý tưởng → suy từ `target_duration/N × ~2.3 từ/giây` (tiếng Việt), fallback 35–55 từ cho cảnh 8s. LLM tuân thủ số cụ thể tốt hơn quy tắc tương đối.
- ⚠️ Áp dụng ở **cả 2 chỗ** build user message: `Code - Validate Input` VÀ `Code - Parse Voice Script` (node này rebuild lại userMessage sau khi có voice script — sửa 1 chỗ sẽ bị chỗ kia ghi đè).

**Lớp 2 — Phát hiện + sửa bằng AI (tái dùng vòng repair có sẵn):**
- `Code - Validate Manifest`: thêm check cân bằng — đếm từ mỗi cảnh, tính trung bình; nếu `max > mean × 1.35` hoặc `min < mean × 0.6` (ngưỡng đề xuất, chỉnh sau khi test) → thêm lỗi `scene_word_imbalance` vào danh sách repair. **Tách riêng loại lỗi này** (`balance_errors`) khỏi lỗi fatal hiện có — vì lệch cân bằng KHÔNG được phép làm chết pipeline.
- `Code - Build Repair Request`: khi có `scene_word_imbalance`, prompt repair kèm số từ hiện tại của từng cảnh + ngân sách đích, yêu cầu chia lại ranh giới câu (giữ nguyên nội dung + image_prompt hợp ngữ cảnh mới).

**Lớp 3 — Lưới an toàn cục bộ (deterministic, không tốn API):**
- `Code - Parse Repair Response`: nếu repair xong **vẫn lệch** (hoặc chỉ có lỗi balance mà repair fail) → **KHÔNG throw fatal** như lỗi khác; thay vào đó tự chia lại cục bộ bằng JS: gộp toàn bộ narration → cắt tại ranh giới câu (. ! ?) → greedy phân bổ câu vào N cảnh sao cho số từ gần đều nhất → giữ nguyên `image_prompt` theo index cũ.
- Trade-off chấp nhận: sau khi chia lại cục bộ, ảnh của cảnh có thể lệch nhẹ so với lời (ảnh mô tả theo ranh giới cũ) — chấp nhận được vì ưu tiên nhịp video đều; ghi rõ vào event để người vận hành biết.

**Quan sát được (nối vào Phase 3 đã có):**
- Đặt cờ `balance_fix: 'ai_repair' | 'local_resplit' | null` vào manifest ở node Build Manifest; worker đọc cờ này → emit render_event warn ("Lời thoại lệch cân bằng — đã sửa bằng AI repair / chia lại cục bộ") — chỉ ~2 dòng thêm vào worker, tái dùng `_emit_render_event` có sẵn.

### Thay đổi code (khi thực hiện)
1. **n8n 02** `Code - Validate Input` + `Code - Parse Voice Script`: ngân sách từ cụ thể trong prompt (Lớp 1).
2. **n8n 02** `Code - Validate Manifest`: check cân bằng → `balance_errors` riêng (Lớp 2).
3. **n8n 02** `Code - Build Repair Request` + `Code - Parse Repair Response`: repair có hướng dẫn số + fallback chia lại cục bộ thay vì fatal (Lớp 2+3).
4. **n8n 02** `Code - Build Manifest`: chuyển tiếp cờ `balance_fix`. (Nhớ re-import + restart — §6.)
5. **Worker** `main_server.py`: đọc `balance_fix` → emit render_event warn (tái dùng `_emit_render_event`).

### Tiêu chí verify
- Test chủ động: giả lập plan có 1 cảnh gấp đôi từ → validate bắt được → sau repair/fallback, mọi cảnh trong ngưỡng (max/mean ≤ 1.35).
- Render 3-5 video thật → không video nào có cảnh lệch >1.35× trung bình (check `durationSec` trong DB).
- Pipeline KHÔNG BAO GIỜ fail chỉ vì lệch cân bằng (fallback cục bộ luôn cứu được).
- `render_events` hiện rõ khi nào phải sửa và sửa bằng cách nào.

> **Phương án đã cân nhắc và loại:** (a) Chỉ siết prompt — không đủ, Gemini vẫn sẽ vi phạm ngẫu nhiên (đã có RULE 5 mà vẫn lệch); (b) 1 cảnh dài → tách thành 2 ảnh lúc render — phá mô hình "1 cảnh = 1 ảnh = 1 image_prompt", đụng worker/assembly sâu, ảnh thứ 2 không có prompt riêng; (c) Đưa balance vào `errors` fatal hiện có — nguy hiểm: video đang ra được sẽ thành fail hoàn toàn nếu repair trượt.

---

## 4. Thứ tự triển khai (đường đi code)

```
Phase 1 (ảnh đáng tin)      → verify: hết quota vẫn ra ảnh đúng chủ đề
Phase 2 (config tới worker) → verify: sub/nhạc/ngôn ngữ theo project, không đụng env
Phase 3 (thấy lỗi)          → verify: lỗi hiện rõ, có nhật ký, hết treo câm
Phase 4 (sửa từng cảnh)     → verify: regenerate 1 cảnh + reassemble
Phase 5 (nhất quán n/vật)   → verify: nhân vật giống nhau qua cảnh
Phase 6 (batch)             → verify: nhiều video 1 lần, tuần tự
Phase 7 (cân bằng lời)      → verify: không cảnh nào lệch >1.35× trung bình, pipeline không fail vì balance
```

**Lý do thứ tự:** 1-2-3 làm mỗi video **đúng và ổn định** (nền tảng), 4-5 làm **chất lượng/kiểm soát**, 6 làm **quy mô**. Không đảo: batch (6) mà chưa có thấy-lỗi (3) thì hỏng hàng loạt trong im lặng.

---

## 5. Checklist tổng (để tick khi làm)

- [x] **P1.1** n8n: fallback Gemini→Pexels→picsum + ghi image_provider vào scene item
- [x] **P1.2** BE: cột `Project.imageFallbackProvider` + truyền xuống n8n *(registry Pexels IMAGE ✅ có sẵn — không sửa)*
- [x] **P1.3** Worker: persist scene.imageProvider (cột mới)
- [x] **P1.4** FE: badge nguồn ảnh
- [x] **P2.1** BE: gửi `burnSubtitles` + `disableBgm` xuống n8n (select ~105 + payload ~202; `language` ✅ đã gửi sẵn)
- [x] **P2.2** n8n Build Manifest: chuyển tiếp `burn_subtitles`/`disable_bgm` vào manifest
- [x] **P2.3** Worker: thêm `disable_bgm` + ưu tiên manifest hơn env *(`burn_subtitles` ✅ đã có + đã nối force — không đụng)*
- [x] **P2.4** FE: toggle sub/nhạc + dropdown ngôn ngữ *(burnSubtitles đã có sẵn trong VoiceConfigPanel.tsx — chỉ thêm disableBgm + language)*
- [x] **P3.1** DB RenderEvent + module Nest *(Video.stage — phát hiện lúc build: cột này thực ra thuộc `Job`, không phải `Video` như plan ghi nhầm; đã thêm migration thật cho `Video.stage`)*
- [x] **P3.2** Worker: emit render-event mỗi bước/lỗi (kèm stage)
- [x] **P3.3** n8n/BE: phát hiện lúc test — n8n trả HTTP 200 rỗng (không phải lỗi) khi workflow throw trước "Respond to Webhook", nên đổi hướng: BE tự validate shape response (`status !== 'accepted'` → coi là fail) thay vì dựa vào n8n Error Trigger
- [x] **P3.4** FE: timeline + nhật ký lỗi
- [x] **P4.1** BE: endpoint regenerate-image/regenerate-voice/reassemble (sửa lời tái dùng `PATCH /scenes/:id` có sẵn)
- [x] **P4.2** Worker: tạo regenerate-image/voice + reassemble *(assemble_master_video ✅ tái dùng; phát hiện: ảnh gốc local bị dọn sau khi video xong → giải pháp trích frame đầu từ clip cũ)*
- [x] **P4.3** FE: lưới cảnh review + nút sửa (trong trang video detail có sẵn, không tạo trang mới)
- [x] **P5.1** DB `Project.defaultCharacterId` (đổi từ `characterRefKey` dự kiến ban đầu — phát hiện lúc code: hệ thống Character/character_bible/ảnh tham chiếu **đã hoạt động đầy đủ**, chỉ thiếu lựa chọn mặc định per-project)
- [x] **P5.2** FE: nút "đặt mặc định" trong `CharacterRefSheet` có sẵn (không tạo mới)
- [x] **P6.1** DB Video.batchId + BE batch endpoint tuần tự qua BullMQ concurrency=1 (poll trạng thái source trước khi cho job kế tiếp chạy)
- [x] **P6.2** FE trang `/projects/[id]/batch`
- [x] **P7.1** n8n: ngân sách từ cụ thể trong prompt (Validate Input + Parse Voice Script — cả 2 chỗ)
- [x] **P7.2** n8n: Validate Manifest check cân bằng → `balance_errors` riêng (không fatal)
- [x] **P7.3** n8n: repair có hướng dẫn số + fallback chia lại cục bộ tại ranh giới câu
- [x] **P7.4** n8n Build Manifest: cờ `balance_fix` + Worker emit render_event warn
- [~] **P7.5** Verify: unit-test bằng đúng dữ liệu lỗi thật ("bạch tuộc" 199/184/354 từ) → PASS (repair + resplit cục bộ đưa về ratio 1.08, giữ nguyên nội dung). Verify **end-to-end bằng render thật bị chặn bởi quota Gemini SCRIPT cạn** (phát hiện mới — xem ghi chú bên dưới) — nhưng log thực tế xác nhận toàn bộ node Phase 7 (Validate Input, Build Voice Request, Parse Voice Script) chạy sạch không lỗi trước khi bị 429.

---

## 6. Rủi ro & lưu ý vận hành (đọc trước khi code)

- **Quota ảnh AI** là ràng buộc thật, không sửa bằng code — Phase 1 chỉ làm cho *không chết*, chất lượng ảnh AI vẫn cần quota/tài khoản trả phí. Pexels là đường free ổn định nhất.
- **Mọi thay đổi n8n phải re-import + restart** (workflow chạy từ DB, không từ file). Ghi rõ bước này trong PR/checklist.
- **Không chạy nhiều scene/video song song quá mức** — edge-tts + Gemini đều rate-limit. Phase 6 cố tình tuần tự.
- **Chỉ dùng API key hợp lệ** — không quay lại luồng session/cookie đã gỡ (vi phạm ToS).
- **Migration Prisma**: mọi cột mới có default → không vỡ dữ liệu cũ. Chạy `prisma migrate` + regenerate client trước khi build backend.
- **Giữ surgical:** mỗi phase chỉ đụng file liệt kê; không refactor phần đang chạy.
- **[Phase 7] Gemini SCRIPT cũng có quota free-tier riêng** (`generate_content_free_tier_requests`, limit 20 request/cửa sổ) — TÁCH BIỆT với quota ảnh đã biết từ Phase 1. Phát hiện khi test dồn dập nhiều lần trong thời gian ngắn làm cạn quota này. Không sửa được bằng code — cần chờ quota hồi hoặc nâng cấp gói trả phí Google AI. Khi test lại, giãn cách giữa các lần render (không dồn dập).

---

## 7. Định nghĩa "hoàn thành" (sản phẩm dùng được)

Tool đạt "vận hành tốt" khi:
1. Nhập title → ra video slideshow **ảnh đúng chủ đề + voice khớp hình + phụ đề**, không cần can thiệp.
2. Khi có sự cố (quota/rate-limit/lỗi) → **hiện rõ, tự phục hồi hoặc báo cụ thể**, không treo câm.
3. Duyệt & **sửa được từng cảnh** trước khi xuất bản.
4. Làm được **nhiều video một lần**.
5. Style kênh nạp qua **config per-project**, đổi kênh không phải sửa code.
