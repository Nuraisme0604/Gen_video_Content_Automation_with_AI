# Design Spec — AI Video Content Tool (v2)

> Phiên bản này thay thế bản cũ. Mục tiêu: đặc tả ĐỦ chi tiết để build thành app thật, không còn chỗ "mơ hồ" — mỗi component có props, API, AC, checklist.

---

## 0. Định vị & Persona

**Định vị**: Tool tự động hoá tạo video AI tiếng Việt cho người sáng tạo nội dung — pipeline đầu-cuối (idea → script → image → voice → video → assemble) + editor nhẹ. So sánh: như **Pictory.ai + Vbee.vn** kết hợp, không cố làm Synthesia (avatar) hay Runway (creative pro).

**3 Persona chính**:

| Persona | Tên | Nhu cầu | Tần suất |
|---|---|---|---|
| Creator hobbyist | "Hằng" — TikToker | Render nhanh, free tier, khỏi nghĩ về model | 5-10 video/tuần |
| Content team | "Tuấn" — Marketing | Batch render, multi-format export, BGM/voice variety | 20-50 video/tuần |
| Power user | "Minh" — Dev | Chọn model cụ thể, tweak temp/cfg/seed, tự host key | 100+ video/tuần |

→ UX phải phục vụ Hằng đầu tiên (preset đơn giản), Tuấn trong production (batch + editor), và mở để Minh tweak (advanced toggle).

---

## 1. User Journey (happy path Persona "Hằng")

```
1. Login → /projects
2. Click "Tạo dự án" → nhập tên "Mèo HN" → vào /projects/abc/create
3. Tab "YouTube" → paste link → click "Phân tích"
4. Hệ thống fetch transcript → auto-fill tóm tắt + đề xuất 8 cảnh
5. Mặc định: preset "Cân bằng" (Imagen 4 Fast + Edge TTS + Slideshow)
6. Click "Sinh video"
7. PipelineProgress card: 5 stage timeline real-time qua Socket.IO
8. ~5 phút sau: preview video play được trong /videos/[vid]
9. Click "Xuất TikTok 9:16" → 60s sau download MP4
```

Các nhánh không-happy-path: **§14 Error Handling**.

---

## 2. Layout & Navigation

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TopBar (h-12): [Logo AI Video Tool] [Dự án ▼ "Mèo HN"]   [🌗] [🔔3] [👤] │
├──────────┬───────────────────────────────────────────────────────────────┤
│ Sidebar  │ Main Workspace (px-6 py-4, max-w-screen-xl)                  │
│ (240px)  │                                                              │
│          │                                                              │
│ Module 1 │ {children}                                                   │
│ Module 2 │                                                              │
│ Module 3 │                                                              │
│ Module 4 │                                                              │
│ Module 5 │                                                              │
│ ──────── │                                                              │
│ Settings │                                                              │
│ Logs     │                                                              │
└──────────┴───────────────────────────────────────────────────────────────┘
```

**Sidebar logic** (đã implement, [frontend/src/components/layout/Sidebar.tsx:27-34](frontend/src/components/layout/Sidebar.tsx#L27)):
- 6 nav item, item nào `requiresProject: true` mà chưa có active project → disabled (màu xám + tooltip "Chọn dự án trước")
- Active project lưu trong `localStorage['vca:lastProjectId']`, đọc lại khi mount

**TopBar logic** ([frontend/src/components/layout/TopBar.tsx](frontend/src/components/layout/TopBar.tsx)):
- Project dropdown: switch project giữ nguyên sub-path (vd đang ở `/videos` → switch → vẫn `/videos` nhưng project mới)
- Theme toggle: dark/light, persist localStorage
- Notification bell: drawer mở từ phải, badge đếm unread

---

## 3. Quản lý API Key (chi tiết)

> Phần quan trọng nhất — đây là chỗ user complain "không ổn lắm" trong v1.

### 3.1 Khái niệm cốt lõi

- **1 API key có thể serve nhiều capability**. Vd key Gemini `AIza...` chạy được Script + Image + Video; key OpenAI `sk-...` chạy Script + Image; key ElevenLabs `xi-...` chạy Voice + BGM.
- **Capability (5 loại)**: `SCRIPT` | `IMAGE` | `VIDEO` | `VOICE` | `BGM`
- **Hệ thống tự xoay vòng** trong cùng capability khi 1 key 429/quota_exceeded

### 3.2 Flow "Thêm key"

```
┌─ Modal: Thêm API Key ─────────────────────────────────────────┐
│                                                                │
│  Dán API key:                                                  │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │ AIzaSy••••••••••••••••••••••••••••••••••                 │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                                │
│  ✓ Phát hiện: Google AI (Gemini, Imagen, Veo)                 │
│                                                                │
│  Cho phép sử dụng trong:                                       │
│  ☑ Sinh kịch bản  (Gemini 2.5 Flash/Pro)                      │
│  ☑ Sinh ảnh       (Imagen 4 — yêu cầu paid plan)              │
│  ☑ Sinh video     (Veo 3 — yêu cầu paid plan)                 │
│  ☐ Sinh giọng nói (Google TTS)                                │
│  ☐ Nhạc nền       (không hỗ trợ)                              │
│                                                                │
│  Tên gợi nhớ (optional): [Gemini chính]                       │
│                                                                │
│  [Test kết nối]            [Huỷ]    [Lưu key]                 │
└────────────────────────────────────────────────────────────────┘
```

**Auto-detect logic** ([frontend/src/app/api-sources/page.tsx](frontend/src/app/api-sources/page.tsx)):

| Prefix | Provider | Default capabilities |
|---|---|---|
| `AIza...` | Google AI | SCRIPT, IMAGE, VIDEO |
| `sk-ant-...` | Anthropic | SCRIPT |
| `sk-proj-...` / `sk-...` | OpenAI | SCRIPT, IMAGE, VOICE |
| `xi-...` | ElevenLabs | VOICE, BGM |
| `key_...` | Runway ML | VIDEO |
| `r8_...` | Replicate | IMAGE, VIDEO |
| Khác | Unknown | (user tự chọn) |

**Test connection logic**: BE endpoint `POST /api/v1/api-sources/test` body `{key, capability}` → call provider's lightest endpoint (vd OpenAI `/v1/models`, Gemini `/v1/models`) → trả `{ok: bool, latencyMs, error?}`. Frontend disable nút Lưu nếu test fail.

### 3.3 Trang quản lý `/api-sources`

```
┌───────────────────────────────────────────────────────────────────────┐
│ Nguồn API                                              [+ Thêm key]   │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ [Tất cả] [Kịch bản] [Ảnh] [Video] [Giọng] [Nhạc]  ← filter chip      │
│                                                                       │
│ ┌─────────────────────────────────────────────────────────────────┐  │
│ │ Provider     Tên       Key        Capabilities  Quota   Status  │  │
│ │ ─────────────────────────────────────────────────────────────── │  │
│ │ 🟢 Google    Gemini.. AIza••42f  ☑Script ☑Image ⚡82%  Active  │  │
│ │              chính                ☑Video                         │  │
│ │              [Edit] [Test] [Reset Quota] [Disable] [Xoá]        │  │
│ │ ─────────────────────────────────────────────────────────────── │  │
│ │ 🟢 OpenAI    GPT      sk-••a1b   ☑Script ☑Image ⚡45%  Active  │  │
│ │ ─────────────────────────────────────────────────────────────── │  │
│ │ 🟡 Veo GCP   Veo paid ya29••x7q  ☑Video         ⚠️98%  Cao     │  │
│ │ ─────────────────────────────────────────────────────────────── │  │
│ │ 🔴 ElevenLabs Voice   xi-••3e8   ☑Voice ☑BGM    ❌    Disabled │  │
│ └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│ 💡 Hệ thống tự xoay key trong cùng capability khi quota gần hết       │
└───────────────────────────────────────────────────────────────────────┘
```

**Quota logic**:
- BE đọc response header `x-ratelimit-remaining` từ provider, lưu `ApiKey.quotaUsed / quotaLimit`
- Quota %= 0-70% xanh, 70-95% vàng, >95% đỏ
- Reset Quota button: chỉ reset counter local (provider tự reset theo lịch của họ)

### 3.4 Rotation logic (BE)

[backend/src/modules/source/api-key.service.ts](backend/src/modules/source/api-key.service.ts):

```ts
async pickKey(capability: Capability, projectId: string): Promise<ApiKey> {
  const candidates = await prisma.apiKey.findMany({
    where: { isActive: true, capabilities: { has: capability }, projectId },
    orderBy: [{ quotaUsedPct: 'asc' }, { lastUsedAt: 'asc' }],
  });
  if (!candidates.length) throw new NoKeyError(capability);
  return candidates[0];
}

async markFailed(keyId: string, error: ProviderError) {
  if (error.code === 'QUOTA_EXCEEDED') {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { quotaUsedPct: 100, lastErrorAt: new Date() },
    });
  } else if (error.code === 'INVALID_KEY') {
    await prisma.apiKey.update({
      where: { id: keyId },
      data: { isActive: false, lastError: error.message },
    });
  }
}
```

**Retry decision** (worker side): nhận `QUOTA_EXCEEDED` → call BE để pick key khác cùng capability → retry tối đa 3 keys → nếu hết → fail job với code `ALL_KEYS_EXHAUSTED`.

### 3.5 Component spec

**`<ApiKeyTable>`** ([frontend/src/app/api-sources/page.tsx](frontend/src/app/api-sources/page.tsx))

| Prop | Type | Mô tả |
|---|---|---|
| `filter` | `Capability \| 'all'` | Filter chip active |

State:
- `keys: ApiKey[]` — TanStack Query `['api-keys']`
- `addModalOpen: bool`
- `editKeyId: string \| null`

API gọi:
- `GET /api/v1/api-sources` — list
- `POST /api/v1/api-sources` — add (body: `{key, name, capabilities[], providerHint?}`)
- `POST /api/v1/api-sources/test` — test connection
- `PATCH /api/v1/api-sources/:id` — edit name/capabilities/isActive
- `DELETE /api/v1/api-sources/:id`
- `POST /api/v1/api-sources/:id/reset-quota`

**Acceptance Criteria**:
- [x] Auto-detect 6 prefixes
- [x] Disable Save nếu test fail
- [x] Mask key (show prefix 4 + suffix 4, ẩn middle)
- [x] Filter chip thay đổi list theo capability
- [ ] Reset Quota button tại table row (TODO)
- [ ] Toast khi save/delete thành công

---

## 4. Chọn Model AI (chi tiết) — KHÔNG MƠ HỒ

> Trong v1 user complain "model chọn lung tung, không biết cái nào". Spec mới: 3 mode, mặc định mode 1.

### 4.1 Mode 1: Preset thông minh (mặc định)

```
┌─ CHẤT LƯỢNG VIDEO ──────────────────────────────────────────────┐
│                                                                  │
│  ○ Nhanh ─ ◉ Cân bằng ─ ○ Cao cấp        [⚙️ Tuỳ chỉnh]         │
│                                                                  │
│  Cân bằng (~5 phút/video, miễn phí):                            │
│  • Kịch bản: Gemini 2.5 Flash                                   │
│  • Ảnh: Imagen 4 Fast (cần paid) hoặc Pexels stock              │
│  • Video: Slideshow Ken Burns + ảnh                              │
│  • Giọng: Edge TTS tiếng Việt (miễn phí)                        │
│  • Nhạc nền: Tự động chọn từ thư viện                            │
│                                                                  │
│  Chi phí ước tính: ~$0.16 (chỉ ảnh)                             │
└──────────────────────────────────────────────────────────────────┘
```

**3 preset cố định**:

| Preset | Script | Image | Video | Voice | BGM | Time | Cost |
|---|---|---|---|---|---|---|---|
| 🚀 Nhanh | Gemini 2.5 Flash | Pexels stock | Slideshow | Edge TTS | Library mp3 | ~2 phút | Free |
| ⚖️ Cân bằng | Gemini 2.5 Flash | Imagen 4 Fast | Slideshow | Edge TTS | Library | ~5 phút | ~$0.16 |
| 💎 Cao cấp | Claude Opus 4.7 | Imagen 4 Ultra | Veo 3 | ElevenLabs Multilingual v2 | Suno v4 | ~15 phút | ~$18 |

Logic chọn: BE check `ApiKey` available cho từng capability → fallback Library cho thiếu.

### 4.2 Mode 2: Per-stage chọn (intermediate)

Click "⚙️ Tuỳ chỉnh" → mở panel:

```
┌─ TUỲ CHỈNH MODEL ───────────────────────────────────────────────┐
│                                                                  │
│  Kịch bản:                                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Gemini 2.5 Flash    [Free, nhanh, OK cho video ngắn] ▼   │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ ◉ Gemini 2.5 Flash  · Free        · Nhanh                │  │
│  │ ○ Gemini 2.5 Pro    · Free        · Chất lượng cao hơn   │  │
│  │ ○ Claude Opus 4.7   · ~$3/1M tok  · Tốt nhất cho VN     │  │
│  │ ○ GPT-5             · ~$2/1M tok  · Đa năng              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Ảnh:                                                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Imagen 4 Fast       [Cần paid, ~$0.04/ảnh] ▼             │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ ○ Pexels stock      · Free        · Ảnh thật từ kho       │  │
│  │ ◉ Imagen 4 Fast     · $0.04/ảnh   · Photorealistic       │  │
│  │ ○ Imagen 4 Ultra    · $0.10/ảnh   · Cao cấp              │  │
│  │ ○ DALL-E 3          · $0.08/ảnh   · Style hoạt hoạ      │  │
│  │ ○ Flux Pro          · $0.05/ảnh   · Sắc nét              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Video:                                                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Slideshow Ken Burns [Free, fallback] ▼                    │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ ◉ Slideshow         · Free        · Ảnh tĩnh + zoom       │  │
│  │ ○ Pexels Video      · Free        · B-roll thật            │  │
│  │ ○ Veo 3             · $0.50/giây  · Best quality animation │  │
│  │ ○ Runway Gen-3      · $0.05/giây  · Creative              │  │
│  │ ○ Kling 1.6         · $0.20/giây  · Cinematic             │  │
│  │ ○ Luma Dream        · $0.30/giây  · Surreal               │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Giọng:                                                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Edge TTS — Nam Minh [Free, tiếng Việt] ▼                 │  │
│  ├───────────────────────────────────────────────────────────┤  │
│  │ ◉ Edge TTS Nam Minh · Free · Nam trẻ, tự nhiên           │  │
│  │ ○ Edge TTS Hoài My  · Free · Nữ trẻ                       │  │
│  │ ○ ElevenLabs Adam   · $0.30/min · Nam trầm, cảm xúc      │  │
│  │ ○ ElevenLabs Bella  · $0.30/min · Nữ ấm                  │  │
│  │ ○ OpenAI Onyx       · $0.20/min · Nam Mỹ                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Nhạc nền:                                                       │
│  ◉ Library nội bộ  ○ Suno v4  ○ ElevenLabs Music  ○ Không có    │
│                                                                  │
│  Tổng chi phí ước tính: $0.16 / video                            │
│                                                                  │
│              [Lưu cấu hình mặc định]   [Áp dụng cho dự án này]   │
└──────────────────────────────────────────────────────────────────┘
```

**UX rules**:
- Mỗi dropdown hiện **giá** + **mô tả 1 dòng** — user không cần Google
- Model bị disable (greyed) nếu không có API key tương ứng → tooltip "Cần thêm key Google AI"
- "Tổng chi phí" tính realtime khi user đổi
- Lưu vào `Project.aiConfig` JSON, default từ `User.aiConfig`

### 4.3 Mode 3: Power user (advanced)

Toggle "Hiện thông số nâng cao" → expand panel:

```
┌─ NÂNG CAO ──────────────────────────────────────────────────────┐
│                                                                  │
│  Script:                                                         │
│  Temperature: [────●────] 0.7   (creativity 0-2)                │
│  Max tokens:  [4096]            (length limit)                   │
│  System prompt: [📝 Edit]                                        │
│                                                                  │
│  Image:                                                          │
│  Aspect: [16:9 ▼]   Quality: [standard ▼]   Style: [photo ▼]    │
│  Negative prompt: [Edit]                                          │
│  Seed: [random / 12345]   ☑ Lock seed cho consistency           │
│                                                                  │
│  Video:                                                          │
│  Duration: [8] sec   FPS: [25]   Motion: [───●──] 0.6           │
│  Aspect: [16:9 ▼]    Image-to-video: ☑ Dùng ảnh đã sinh          │
│                                                                  │
│  Voice:                                                          │
│  Speed: [────●────] 1.0x   Pitch: [───●─────] 0   Stability: [0.5]│
│                                                                  │
│  ─────────────────────────────────────────                       │
│  ⚠️ Các thông số này chỉ thay đổi nếu bạn hiểu                  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.4 Component spec

**`<ModelSelector>`** ([frontend/src/components/video/ModelSelector.tsx], TODO)

| Prop | Type | Mô tả |
|---|---|---|
| `value` | `AiConfig` | Current config |
| `onChange` | `(c: AiConfig) => void` | |
| `mode` | `'preset' \| 'per-stage' \| 'advanced'` | Default 'preset' |
| `availableKeys` | `ApiKey[]` | Để disable model thiếu key |

```ts
type AiConfig = {
  preset?: 'fast' | 'balanced' | 'premium' | 'custom';
  script: { provider: string; model: string; temp?: number; maxTokens?: number };
  image: { provider: string; model: string; aspect: string; quality: string; seed?: number };
  video: { provider: string; model: string; duration: number; fps: number; motion?: number };
  voice: { provider: string; voiceId: string; speed: number; pitch: number };
  bgm: { provider: string; trackId?: string };
};
```

**Acceptance Criteria**:
- [ ] Mỗi model card hiện giá + mô tả + badge (Free/Paid)
- [ ] Disable model nếu không có API key tương ứng
- [ ] Chi phí update realtime
- [ ] Lưu vào `Project.aiConfig` qua `PATCH /api/v1/projects/:id`
- [ ] Toggle Advanced mode persist localStorage

---

## 5. Module 1: Tạo Video

### 5.1 Source Input (Sub-feature 1.1)

**Path**: [frontend/src/app/projects/[id]/create/page.tsx](frontend/src/app/projects/[id]/create/page.tsx)

```
┌─ NGUỒN ĐẦU VÀO ─────────────────────────────────────────────────┐
│                                                                  │
│  [📺 YouTube] [📰 Báo] [📖 Truyện] [✍️ Tự nhập]                 │
│                                                                  │
│  ┌─ Tab YouTube ───────────────────────────────────────────────┐│
│  │ Link YouTube:                                                ││
│  │ [https://youtube.com/watch?v=abc...]      [📥 Phân tích]    ││
│  │                                                              ││
│  │ ⚠️  Bạn chịu trách nhiệm bản quyền nội dung tham khảo       ││
│  │                                                              ││
│  │ Sau khi phân tích:                                           ││
│  │ ✓ Tiêu đề: "Cách làm bún bò Huế"                            ││
│  │ ✓ Thời lượng gốc: 12:34                                      ││
│  │ ✓ Transcript: 2,340 từ                                       ││
│  │                                                              ││
│  │ Mô tả phong cách (optional):                                 ││
│  │ [Văn phong dí dỏm, gen Z, ngắn gọn 60 giây...]              ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**4 Tab spec**:

| Tab | Input | Output (parsed) | API |
|---|---|---|---|
| YouTube | URL | `{title, duration, transcript, channel}` | `POST /api/v1/sources/youtube` → enqueue `transcript-fetch` |
| Báo | URL | `{title, content, author}` | `POST /api/v1/sources/article` → readability parser |
| Truyện | Text + tiêu đề | `{title, content}` | `POST /api/v1/sources/manual` |
| Tự nhập | Markdown | `{title, content}` | `POST /api/v1/sources/manual` |

**Component**: `<SourceInputTabs>` 

```ts
type SourceInput = {
  type: 'youtube' | 'article' | 'story' | 'manual';
  url?: string;
  rawText?: string;
  title?: string;
  styleHint?: string;
};
```

**Acceptance Criteria**:
- [x] 4 tab hoạt động
- [x] YouTube tab gọi worker fetch transcript
- [ ] Báo tab parse với Readability.js (TODO)
- [ ] Truyện tab có character limit hint (max 5000 từ)
- [x] Disclaimer copyright hiện trên tab YouTube
- [ ] "Phân tích lại" button khi đã có data
- [x] Lưu nháp tự động vào localStorage (debounce 1s)

### 5.2 Voice Config (Sub-feature 1.2)

```
┌─ VOICE ─────────────────────────────────────────────────────────┐
│                                                                  │
│  Nguồn: ◉ Edge TTS (free)  ○ ElevenLabs  ○ OpenAI  ○ Google     │
│                                                                  │
│  Giọng (Edge TTS — tiếng Việt):                                  │
│  ┌─────────────┬─────────────┐                                   │
│  │ ◉ Nam Minh  │ ○ Hoài My   │                                   │
│  │ Nam trẻ     │ Nữ trẻ      │                                   │
│  │ [▶ Nghe]    │ [▶ Nghe]    │                                   │
│  └─────────────┴─────────────┘                                   │
│                                                                  │
│  Tốc độ:    [────●────] 1.0x   (0.5x - 2.0x)                    │
│  Cao độ:    [───●─────] 0      (-12 đến +12 semitones)          │
│  Cảm xúc:   [Trung tính ▼]                                       │
│                                                                  │
│  ☑ Áp dụng cho tất cả cảnh                                      │
│  ☐ Cho phép override theo từng cảnh                              │
│                                                                  │
│              [Lưu vào dự án]                                     │
└──────────────────────────────────────────────────────────────────┘
```

**Component**: `<VoiceConfigPanel>` ([frontend/src/components/video/VoiceConfigPanel.tsx](frontend/src/components/video/VoiceConfigPanel.tsx)) — đã có placeholder, cần update.

**Available voices** (BE returns from `/api/v1/voices?provider=edge-tts`):

```ts
type Voice = {
  id: string;            // 'vi-VN-NamMinhNeural'
  provider: string;
  language: string;       // 'vi-VN'
  gender: 'male' | 'female';
  age: 'young' | 'mid' | 'old';
  styleSupports: string[]; // ['neutral', 'cheerful', 'sad']
  sampleUrl?: string;
};
```

**Acceptance Criteria**:
- [x] Edge TTS nam-minh chạy được
- [ ] Hoài My (nữ) chọn được
- [ ] Preview "▶ Nghe" — gọi `POST /api/v1/voices/preview` body `{voiceId, text: "Xin chào, đây là giọng đọc"}` → trả audio URL
- [ ] Slider speed/pitch hoạt động (apply qua SSML)
- [ ] ElevenLabs voices hiện khi user có key xi-

### 5.3 Image Generation (Sub-feature 1.3)

Image gen có 2 chỗ:

**a. Character Reference Sheet** — ảnh nhân vật (consistency across scenes)

```
┌─ NHÂN VẬT (Character Reference) ────────────────────────────────┐
│                                                                  │
│  ┌────────┐  Tên: MAN                                            │
│  │ [thumb]│  Mô tả: Caucasian male, 30s, dark beard,             │
│  │        │         brown eyes, casual shirt                     │
│  └────────┘  ☑ Giữ consistent cho tất cả ảnh có nhân vật này   │
│              [Upload ảnh] [Sinh từ AI] [Sửa] [Xoá]               │
│                                                                  │
│  ┌────────┐  Tên: DOG                                            │
│  │ [thumb]│  Mô tả: small Cockapoo, cinnamon-colored,            │
│  │        │         curly hair, friendly                         │
│  └────────┘                                                      │
│                                                                  │
│  [+ Thêm nhân vật mới]                                           │
└──────────────────────────────────────────────────────────────────┘
```

**Component**: `<CharacterRefSheet>` ([frontend/src/components/video/CharacterRefSheet.tsx](frontend/src/components/video/CharacterRefSheet.tsx))

**b. Per-Scene Image** — ảnh cho từng cảnh (auto trong pipeline)

Người dùng không trực tiếp generate ảnh per-scene; pipeline tự động dùng `Project.aiConfig.image.model` + prompt từ Gemini script. Hiện trong `<SceneCard>` ở /videos/[vid]:

```
┌─ Cảnh 1 ────────────────────────────────────────────────────────┐
│ ┌──────────┐  📝 Image prompt:                                   │
│ │ [thumb]  │  "Cinematic close-up of a black cat on a Hanoi     │
│ │  ▶       │   street, golden hour, photo-realistic, 16:9"      │
│ └──────────┘  [Sửa prompt]   [Sinh lại ảnh]  [Upload thay]      │
└──────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria**:
- [x] Character ref panel hiển thị
- [ ] Upload ảnh nhân vật → MinIO (BE endpoint `POST /api/v1/characters` multipart, TODO)
- [ ] "Sinh từ AI" — gọi image gen với prompt đặc tả nhân vật
- [ ] Nhân vật được include trong scene prompt khi mention name
- [ ] Sửa prompt scene → trigger `POST /api/v1/scenes/:id/regenerate` → re-gen ảnh + update DB

### 5.4 Subtitle Editor (Sub-feature 1.4)

**Component**: `<SubtitleEditor>` ([frontend/src/components/video/SubtitleEditor.tsx], TODO)

```
┌─ SUB CỦA CẢNH 1 ────────────────────────────────────────────────┐
│                                                                  │
│  [📥 Tự sinh từ Audio (Whisper)] [📁 Import .srt] [✏️ Sửa tay]  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ # │ Start  │ End    │ Text                                 │ │
│  │───┼────────┼────────┼──────────────────────────────────────│ │
│  │ 1 │ 00:00.0│ 00:03.5│ Hôm nay tôi sẽ kể về một câu chuyện │ │
│  │   │        │        │ ở Hà Nội...                          │ │
│  │ 2 │ 00:03.5│ 00:07.0│ Một ngày bình thường nhưng đầy bất  │ │
│  │   │        │        │ ngờ.                                  │ │
│  │ 3 │ 00:07.0│ 00:10.0│ [+ thêm dòng]                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  Style:                                                          │
│  Font: [Inter ▼]  Size: [42 ▼]  Color: [Trắng ▼]                │
│  Outline: [☑ Đen]  Position: ○ Trên ◉ Dưới ○ Giữa               │
│  Background: ☐ Hộp đen mờ (cho đoạn phụ đề dài)                 │
│                                                                  │
│  [▶ Preview với sub]   [💾 Lưu]   [🔁 Re-render scene]          │
└──────────────────────────────────────────────────────────────────┘
```

**Data model**:
```ts
type SubtitleCue = {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
};
type SubtitleStyle = {
  font: string;
  sizePx: number;
  color: string;
  outline: { enabled: boolean; color: string };
  position: 'top' | 'middle' | 'bottom';
  background: { enabled: boolean; opacity: number };
};
```

**API**:
- `GET /api/v1/scenes/:id/subtitle` → `{cues: [], style: {...}}`
- `PATCH /api/v1/scenes/:id/subtitle` → save
- `POST /api/v1/scenes/:id/subtitle/auto-generate` → enqueue Whisper job
- `POST /api/v1/scenes/:id/subtitle/burn-in` → enqueue ffmpeg burn-in re-render

**Acceptance Criteria**:
- [ ] List cue editable inline (textarea expand on focus)
- [ ] Drag handle giữa start/end của 2 cue cạnh nhau để chỉnh timing
- [ ] Auto-save debounce 1s
- [ ] Style preview update realtime
- [ ] Burn-in trigger job, progress hiện qua Socket.IO
- [ ] Validate: cue.start < cue.end, không overlap

---

## 6. Module 2: Quản lý Video

### 6.1 Video Library (Sub-feature 2.1)

**Path**: [frontend/src/app/projects/[id]/videos/page.tsx](frontend/src/app/projects/[id]/videos/page.tsx)

```
┌───────────────────────────────────────────────────────────────────────┐
│ Video                                  [🔍 Tìm...] [Lọc ▼] [+ Tạo mới] │
├───────────────────────────────────────────────────────────────────────┤
│ Filter: [Tất cả] [Đang chạy] [Hoàn thành] [Lỗi]                       │
│ Sort:   [Mới nhất ▼]  View: [⊞ Grid] [☰ List]                         │
│                                                                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                  │
│ │ [thumb]  │ │ [thumb]  │ │ [thumb]  │ │ [thumb]  │                  │
│ │   ▶      │ │  ⏳      │ │   ▶      │ │   ❌     │                  │
│ │  3:24    │ │  60%     │ │  2:10    │ │ Failed   │                  │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘                  │
│  Mèo HN     Bún bò Huế   Stickman    Báo #12                          │
│  ✅ Done    ⏳ Rendering ✅ Done    ❌ Quota                           │
└───────────────────────────────────────────────────────────────────────┘
```

**Click 1 video** → navigate `/projects/:id/videos/[vid]` (chi tiết §6.2).

**Acceptance Criteria**:
- [x] Grid/List view toggle
- [x] Status badge color đúng
- [x] Click → detail page
- [ ] Filter status hoạt động (TODO: chỉ có sort, chưa có filter)
- [ ] Search tìm trong title

### 6.2 Video Detail + Editor

**Path**: [frontend/src/app/projects/[id]/videos/[vid]/page.tsx](frontend/src/app/projects/[id]/videos/[vid]/page.tsx)

```
┌───────────────────────────────────────────────────────────────────────┐
│ ← Mèo Hà Nội · 3:24 · ✅ Done                       [⋮ menu]         │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ┌─ PREVIEW ─────────────────────┐ ┌─ ACTIONS ──────────────────────┐ │
│ │                                │ │ ✂️  Cắt                        │ │
│ │     [VIDEO PLAYER]             │ │ ⬚   Crop                       │ │
│ │                                │ │ 📐  Xuất (9:16, 16:9, 1:1)    │ │
│ │     ▶ ━━●━━━━━ 1:24 / 3:24    │ │ 🎬  Ghép thêm cảnh             │ │
│ │                                │ │ 📝  Sửa sub                    │ │
│ └────────────────────────────────┘ │ 📋  Copy prompt                 │ │
│                                    │ 📥  Tải xuống                   │ │
│ ┌─ TIMELINE / SCENES ────────────┐ │ 🗑️  Xoá                        │ │
│ │ Scene 1 ████  Scene 2 ████     │ └─────────────────────────────────┘│
│ │ Scene 3 ████  Scene 4 ████     │                                    │
│ │ Click 1 scene → expand edit    │                                    │
│ └────────────────────────────────┘                                    │
│                                                                       │
│ ┌─ METADATA ─────────────────────────────────────────────────────────┐│
│ │ Tạo lúc: 2026-05-08 14:32 · Tổng cost: $0.16 · Job ID: bull_421   ││
│ │ Source: youtube://abc · Models: Gemini 2.5F + Imagen 4F + Slideshow││
│ └────────────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────────────┘
```

### 6.3 VideoTrimmer (Sub-feature 2.2)

**Component**: `<VideoTrimmer>` ([frontend/src/components/video/VideoTrimmer.tsx], TODO)

```
┌─ ✂️ CẮT VIDEO ───────────────────────────────────────────────────┐
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           [VIDEO PREVIEW (controlled by slider)]          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Timeline:                                                       │
│  0:00 ▮[━━━━━━●━━━━━━━━━━━━━━━●━━━━━]▮ 3:24                     │
│        IN: 0:05                OUT: 3:00   → Output: 2:55       │
│                                                                  │
│  Snap to scene: [☑ snap]                                        │
│  ☐ Giữ audio gốc  ◉ Re-encode  ○ Copy stream (nhanh hơn)        │
│                                                                  │
│              [Reset]  [▶ Preview cut]  [💾 Lưu thành file mới]  │
└──────────────────────────────────────────────────────────────────┘
```

**Logic**:
- 2 handle drag trên slider, snap vào scene boundary nếu enabled
- `Re-encode` (default) chính xác đến frame, chậm 2-3x
- `Copy stream` dùng `-c copy`, nhanh nhưng chỉ snap đến keyframe
- Submit `POST /api/v1/videos/:id/trim` body `{startMs, endMs, mode: 'reencode' | 'copy'}` → enqueue `trim` job → output `videos/:id/trim_<timestamp>.mp4`

**Acceptance Criteria**:
- [ ] Slider 2 handle hoạt động
- [ ] Preview update khi drag
- [ ] Snap to scene boundary
- [ ] Job progress hiện qua Socket.IO
- [ ] Output video mới appear in library

### 6.4 VideoCropTool (Sub-feature 2.4) + FormatExportModal (Sub-feature 2.3)

Hai feature này gộp thành 1 modal vì user thường crop để export sang format khác.

**Component**: `<FormatExportModal>` ([frontend/src/components/video/FormatExportModal.tsx], TODO)

```
┌─ XUẤT VIDEO ────────────────────────────────────────────────────┐
│                                                                  │
│  Mục đích sử dụng:                                               │
│  ┌────────────┬────────────┬────────────┬────────────┐          │
│  │ ◉ TikTok   │ ○ YouTube  │ ○ Instagram│ ○ Tuỳ chỉnh│          │
│  │ Reels      │ regular    │ Square     │            │          │
│  │ 9:16       │ 16:9       │ 1:1        │            │          │
│  │ 1080x1920  │ 1920x1080  │ 1080x1080  │            │          │
│  └────────────┴────────────┴────────────┴────────────┘          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              [PREVIEW (with crop overlay)]                │   │
│  │                                                            │   │
│  │              ╔═════════════╗                               │   │
│  │              ║             ║   ← drag để crop              │   │
│  │              ║   [video]   ║                               │   │
│  │              ║             ║                               │   │
│  │              ╚═════════════╝                               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Crop mode: ◉ Smart (auto detect subject)  ○ Center  ○ Manual   │
│                                                                  │
│  Chất lượng: ○ 720p ◉ 1080p ○ 4K        Codec: [H.264 ▼]       │
│  Bitrate: ◉ Auto  ○ Low (5Mbps)  ○ High (15Mbps)                │
│                                                                  │
│              [Huỷ]    [Xuất] (~30-60 giây)                      │
└──────────────────────────────────────────────────────────────────┘
```

**4 preset cố định**:

| Preset | Aspect | Resolution | Codec | Bitrate |
|---|---|---|---|---|
| TikTok/Reels | 9:16 | 1080x1920 | H.264 | 8Mbps |
| YouTube | 16:9 | 1920x1080 | H.264 | 10Mbps |
| Instagram Square | 1:1 | 1080x1080 | H.264 | 6Mbps |
| Custom | user-defined | user | user | user |

**API**: `POST /api/v1/videos/:id/export` body `{preset, aspect, resolution, codec, bitrate, cropMode, cropBox?}`
→ enqueue `export` job → output `videos/:id/export_<format>.mp4`
→ DB ghi vào `VideoExport {id, videoId, format, s3Key, status, createdAt}`

**Smart crop logic** (worker):
- Detect subject với OpenCV face/object detection trên frame giữa
- Center bounding box trong crop window
- Fallback `center` nếu detect fail

**Acceptance Criteria**:
- [ ] 4 preset radio
- [ ] Crop overlay drag được khi mode=Manual
- [ ] Preview update theo preset
- [ ] Submit job + progress live
- [ ] Output file appear in library + auto download

---

## 7. Module 3: Nguồn API

Đã chi tiết ở **§3 Quản lý API Key**. Trang `/api-sources` chia 5 tab capability + tab "Tất cả".

---

## 8. Module 4: Thông báo

### 8.1 In-App Drawer (Sub-feature 4.2)

**Component**: `<NotificationDrawer>` ([frontend/src/components/layout/NotificationDrawer.tsx](frontend/src/components/layout/NotificationDrawer.tsx))

```
                            ┌─────────────────────────────────────┐
                             │  🔔 Thông báo (3)            [×]   │
                             ├─────────────────────────────────────┤
                             │  [Tất cả] [Lỗi] [Telegram]          │
                             │                                     │
                             │  ─ Hôm nay ─                        │
                             │                                     │
                             │  ✅ 14:32                            │
                             │  Video "Mèo Hà Nội" hoàn thành     │
                             │  4 cảnh · 32 giây              [→]  │
                             │                                     │
                             │  ❌ 14:28                            │
                             │  Cảnh 3 lỗi: Veo timeout            │
                             │  [🔁 Chạy lại]                       │
                             │                                     │
                             │  📤 14:15                            │
                             │  Đã gửi log Telegram                │
                             │                                     │
                             │  ─ Hôm qua ─                        │
                             │  ...                                │
                             │                                     │
                             │  [⚙️ Cài đặt thông báo]             │
                             └─────────────────────────────────────┘
```

**Realtime**: Socket.IO `/notifications` namespace, room `user:${userId}`. Events:
- `notification:new` `{id, type, title, message, severity, link?}`
- `notification:read` `{id}`

**Component spec**:

```ts
type Notification = {
  id: string;
  type: 'video_complete' | 'scene_failed' | 'quota_warning' | 'telegram_sent' | 'system';
  severity: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
};
```

**Acceptance Criteria**:
- [x] Drawer mở/đóng
- [x] Tab filter
- [x] Group by ngày (Hôm nay/Hôm qua/Trước đó)
- [ ] Click notification → navigate to link, mark read
- [ ] Mark all read button

### 8.2 Telegram Bot (Sub-feature 4.1)

**Path**: [frontend/src/app/notifications/settings/page.tsx](frontend/src/app/notifications/settings/page.tsx)

```
┌─ THÔNG BÁO TELEGRAM ────────────────────────────────────────────┐
│                                                                  │
│  Bot Token:  [••••••••••••••••••••••••]   [Test]                │
│  Chat ID:    [-100123456789]              [Lấy từ @userinfobot] │
│  Status:     🟢 Connected (last test: 2m ago)                   │
│                                                                  │
│  Sự kiện gửi thông báo:                                          │
│  ☑ Video hoàn thành                                              │
│  ☑ Cảnh lỗi (sau 3 lần retry)                                    │
│  ☑ Hết quota API                                                 │
│  ☐ Job bắt đầu chạy                                              │
│  ☐ Mỗi cảnh sinh xong  ⚠️ spam, không khuyến khích              │
│                                                                  │
│  Template tin nhắn:                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ✅ {project} - {video_title} hoàn thành                    │ │
│  │ ⏱ {duration} · 🎬 {scene_count} cảnh                       │ │
│  │ 🔗 {url}                                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│  Biến: {project} {video_title} {duration} {scene_count} {url}   │
│  {error_msg} {provider}                                          │
│                                                                  │
│  [Gửi tin test]  [💾 Lưu]                                       │
└──────────────────────────────────────────────────────────────────┘
```

**API**:
- `GET /api/v1/notifications/telegram-config`
- `PATCH /api/v1/notifications/telegram-config` body `{botToken, chatId, events[], template}`
- `POST /api/v1/notifications/telegram-test`

**Acceptance Criteria**:
- [x] Form lưu được vào DB
- [x] Test button gửi thật
- [x] Event checkboxes persist
- [ ] Template editor có syntax highlight cho biến `{...}`
- [ ] Preview rendered template với data fake

### 8.3 Log Sink (Sub-feature 4.3)

```
┌─ ĐẨY LOG ───────────────────────────────────────────────────────┐
│                                                                  │
│  Đích đến (chọn nhiều):                                          │
│  ☑ File local: [./logs/app-{date}.log]    [Mở thư mục]          │
│  ☐ Telegram channel: [-100987654321]                             │
│  ☐ Webhook: [https://example.com/log]    [Test]                  │
│  ☐ Sentry DSN: [https://...sentry.io/...]                        │
│                                                                  │
│  Mức log: ○ Debug  ◉ Info  ○ Warn  ○ Error                      │
│  Xoay vòng: [Hàng ngày ▼]   Giữ: [30 ngày ▼]                    │
│                                                                  │
│  ──────────────────────────────────                              │
│  📋 LOG GẦN ĐÂY (last 50)                       [↻ Refresh]      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 14:32 [INFO]  pipeline.complete videoId=abc duration=32s   │ │
│  │ 14:28 [ERROR] veo.timeout sceneId=3 retry=1/3              │ │
│  │ 14:15 [INFO]  project.created name="Mèo HN"                │ │
│  └────────────────────────────────────────────────────────────┘ │
│  [Tải log file]  [Xoá log cũ]                                   │
└──────────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria**:
- [ ] 4 sink type checkbox + form input
- [ ] Webhook test gửi POST `{level, message, ts}`
- [ ] Log table với pagination, search
- [ ] Tải log file as `.log` zip

---

## 9. Module 5: Quản lý Frame

> "Frame" = thư viện ảnh tái sử dụng (intro/outro/template). Khác với "scene image" sinh tự động.

### 9.1 Frame Library

**Path**: [frontend/src/app/projects/[id]/frames/page.tsx](frontend/src/app/projects/[id]/frames/page.tsx)

```
┌──────────────────────────────────────────────────────────────────┐
│ Frame thư viện · Dự án: Mèo HN                  [+ Tạo frame]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ Frame: "Intro nền xanh" ────────────────────────────────┐   │
│  │  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                          │   │
│  │  │1 │ │2 │ │3 │ │4 │ │5 │ │+ │   [↕ Drag để sắp xếp]    │   │
│  │  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘                          │   │
│  │  [✏️ Sửa] [🗑️ Xoá]                                        │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─ Frame: "Outro CTA" ─────────────────────────────────────┐   │
│  │  ┌──┐ ┌──┐ ┌──┐                                          │   │
│  │  │1 │ │2 │ │+ │                                          │   │
│  │  └──┘ └──┘ └──┘                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [Sinh video từ frame đã chọn →]                                 │
└──────────────────────────────────────────────────────────────────┘
```

### 9.2 Frame Detail (Sub-feature 5.1 + 5.2)

**Path**: `/projects/[id]/frames/[fid]`

```
┌──────────────────────────────────────────────────────────────────┐
│ Frame: "Intro nền xanh"                          [💾 Lưu] [🗑️]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─ ẢNH TRONG FRAME ──────────────────────────────────────┐    │
│  │  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                              │    │
│  │  │1 │ │2 │ │3 │ │4 │ │5 │   ← Drag handle hover hiện   │    │
│  │  └──┘ └──┘ └──┘ └──┘ └──┘                              │    │
│  │  [✕]  [✕]  [✕]  [✕]  [✕]  ← Hover hiện nút xoá        │    │
│  │                                                         │    │
│  │  [📤 Upload từ máy]  [✨ Sinh ảnh AI]  [📋 Paste URL]   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌─ TẠO ẢNH ĐỂ SINH VIDEO (Sub-feature 5.1) ────────────┐      │
│  │ Provider: [Imagen 4 Fast ▼]                            │      │
│  │ Prompt:                                                │      │
│  │ ┌────────────────────────────────────────────────────┐ │      │
│  │ │ Cinematic green screen background, soft lighting,  │ │      │
│  │ │ minimal style, 16:9 aspect                          │ │      │
│  │ └────────────────────────────────────────────────────┘ │      │
│  │ Negative: [Edit]      Số lượng: [4]                    │      │
│  │ Tỉ lệ: [16:9 ▼]    Style: [Photo ▼]                    │      │
│  │                                                        │      │
│  │              [✨ Sinh ảnh] (~15s, ~$0.16)              │      │
│  └────────────────────────────────────────────────────────┘      │
│                                                                  │
│  ┌─ SỬ DỤNG FRAME ───────────────────────────────────────┐      │
│  │ → [Dùng frame này tạo video mới]                       │      │
│  │ → [Apply như intro/outro cho video hiện tại]           │      │
│  │ → [Apply cho tất cả cảnh trong project]                │      │
│  └────────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
```

**Component**: `<FrameImageManager>` + `<FrameImageGenerator>`

**API**:
- `GET /api/v1/projects/:id/frames` — list
- `POST /api/v1/frames` — create (body: `{name, projectId}`)
- `PATCH /api/v1/frames/:id` — rename
- `DELETE /api/v1/frames/:id`
- `POST /api/v1/frames/:id/images` — multipart upload OR `{url}` paste OR `{prompt, model, count}` AI gen
- `DELETE /api/v1/frames/:id/images/:imgId`
- `PATCH /api/v1/frames/:id/reorder` — body `{orderedIds: []}`

**Acceptance Criteria**:
- [x] List frames
- [ ] Drag-drop reorder ảnh trong frame (`@dnd-kit/sortable`)
- [ ] Upload từ máy (MinIO multipart)
- [ ] Paste URL (BE download → re-upload MinIO)
- [ ] AI gen — gọi `POST /api/v1/frames/:id/images` với `{prompt, model, count}` → enqueue job → progress
- [ ] "Apply như intro" → ghép frame.images vào đầu video master, re-render

---

## 10. Cross-cutting concerns

### 10.1 Pipeline Progress (real-time UX)

**Component**: `<PipelineProgress>` ([frontend/src/components/video/PipelineProgress.tsx](frontend/src/components/video/PipelineProgress.tsx))

```
┌─ ĐANG TẠO VIDEO "MÈO HN" ───────────────────────────────────────┐
│                                                                  │
│  Tổng tiến độ: ████████░░ 80% · ETA 1 phút 20 giây              │
│                                                                  │
│  ✅ 1. Phân tích nguồn       (12s)                               │
│  ✅ 2. Sinh kịch bản          (24s)   4 cảnh                     │
│  ✅ 3. Sinh ảnh                (45s)   4/4 ảnh                   │
│  ⏳ 4. Sinh video              (68s)   2/4 cảnh                  │
│      └─ Cảnh 3: ████████░░ 80%                                   │
│  ⏸️  5. Ghép master + sub                                        │
│                                                                  │
│  [📋 Xem log]  [⏸️ Tạm dừng]  [🛑 Huỷ]                          │
└──────────────────────────────────────────────────────────────────┘
```

**Realtime data flow**:
```
Worker emit job.updateProgress({stage, sceneIdx, pct})
  → BullMQ QueueEvents.progress
  → NestJS JobsGateway emit `job:progress` to room `video:${videoId}`
  → useJobSocket hook update React state
  → PipelineProgress re-render
```

### 10.2 Error Handling (chuẩn hoá)

**Error code BE → UX message FE**:

| Code | Tiếng Việt user-facing | Action |
|---|---|---|
| `INVALID_KEY` | "Key API không hợp lệ. Vui lòng kiểm tra lại." | Mở dialog edit key |
| `QUOTA_EXCEEDED` | "Hết quota API {provider}. Tự động chuyển key khác." | (không cần, BE auto rotate) |
| `ALL_KEYS_EXHAUSTED` | "Tất cả key {capability} đã hết quota. Vui lòng thêm key mới." | Link to /api-sources |
| `RENDER_TIMEOUT` | "Render quá thời gian (>15 phút). Đã huỷ. Thử lại?" | [Retry] button |
| `INSUFFICIENT_CONTENT` | "Nội dung quá ngắn (<50 từ). Vui lòng cung cấp thêm." | Focus input |
| `UNSUPPORTED_LANGUAGE` | "Ngôn ngữ không hỗ trợ. Hiện chỉ có VN và EN." | (none) |
| `MINIO_UPLOAD_FAILED` | "Lỗi lưu file. Hệ thống tự thử lại." | (auto retry 3x) |

**Toast pattern**:
```ts
// Thành công
toast.success("Đã tạo video", { description: "Mèo Hà Nội · 32s" });

// Lỗi user-action
toast.error("Key không hợp lệ", { 
  action: { label: "Sửa", onClick: () => openKeyEditor(keyId) }
});

// Info
toast("Đang chuyển key OpenAI khác do quota...", { duration: 3000 });
```

### 10.3 Loading States

| Trường hợp | Pattern |
|---|---|
| Initial fetch (page first load) | `<Skeleton>` cho từng row/card, KHÔNG hiện "Đang tải..." |
| Re-fetch (TanStack `isFetching`) | Subtle pulse animation trên data, không block UI |
| Mutating (form submit) | Button disabled + spinner inline |
| Long job (render >30s) | `<PipelineProgress>` card |

### 10.4 Theming

- Default: dark mode (giống Linear, V0)
- Toggle: `<ThemeToggle>` ở TopBar, persist `localStorage['vca:theme']`
- Token: `--bg`, `--card`, `--border`, `--text`, `--text-muted`, `--primary` (violet 600)
- shadcn/ui presets

---

## 11. Database Schema (mở rộng từ Prisma hiện tại)

**Thêm models mới**:

```prisma
model Character {
  id          String   @id @default(cuid())
  projectId   String
  name        String                          // "MAN", "DOG"
  description String                          // "Caucasian male, 30s, dark beard"
  refImageKey String?                         // S3 key
  consistent  Boolean  @default(true)
  project     Project  @relation(fields: [projectId], references: [id])
  createdAt   DateTime @default(now())
  @@index([projectId])
}

model VideoExport {
  id         String   @id @default(cuid())
  videoId    String
  format     String                          // 'tiktok' | 'youtube' | 'instagram' | 'custom'
  aspect     String                          // '9:16' | '16:9' | '1:1'
  resolution String                          // '1080x1920'
  s3Key      String?
  status     String                          // 'queued' | 'rendering' | 'done' | 'failed'
  jobId      String?
  createdAt  DateTime @default(now())
  video      Video    @relation(fields: [videoId], references: [id])
  @@index([videoId])
}

model Subtitle {
  id      String  @id @default(cuid())
  sceneId String  @unique
  cues    Json                              // SubtitleCue[]
  style   Json                              // SubtitleStyle
  scene   Scene   @relation(fields: [sceneId], references: [id])
}

model TelegramConfig {
  id          String  @id @default(cuid())
  projectId   String  @unique
  botToken    String                        // encrypted
  chatId      String
  events      Json                          // ['video_complete', 'scene_failed', ...]
  template    String
  enabled     Boolean @default(true)
  project     Project @relation(fields: [projectId], references: [id])
}

model LogSink {
  id          String  @id @default(cuid())
  projectId   String
  type        String                        // 'file' | 'telegram' | 'webhook' | 'sentry'
  config      Json                          // {path}, {chatId}, {url}, {dsn}
  level       String  @default("info")
  enabled     Boolean @default(true)
  project     Project @relation(fields: [projectId], references: [id])
}
```

**Mở rộng models cũ**:

```prisma
model Project {
  // ...existing fields
  aiConfig        Json?                     // AiConfig type
  voiceConfig     Json?                     // default voice settings
  characters      Character[]
  telegramConfig  TelegramConfig?
  logSinks        LogSink[]
}

model Video {
  // ...existing fields
  exports         VideoExport[]
}

model Scene {
  // ...existing fields
  subtitle        Subtitle?
}

model ApiKey {
  // ...existing fields
  capabilities    String[]                  // ['SCRIPT', 'IMAGE', 'VIDEO', 'VOICE', 'BGM']
  quotaUsedPct    Int      @default(0)
  lastUsedAt      DateTime?
  lastErrorAt     DateTime?
  lastError       String?
  errorCount      Int      @default(0)
  n8nCredentialId String?                   // synced credential ID
}
```

---

## 12. REST API Contract (key endpoints)

```
# Projects
GET    /api/v1/projects
POST   /api/v1/projects                    body: {name, description?}
GET    /api/v1/projects/:id
PATCH  /api/v1/projects/:id                body: {name?, aiConfig?, voiceConfig?}
DELETE /api/v1/projects/:id

# Sources (Module 1 - Sub 1.1)
POST   /api/v1/sources/youtube             body: {projectId, url, styleHint?}
POST   /api/v1/sources/article             body: {projectId, url}
POST   /api/v1/sources/manual              body: {projectId, title, content, styleHint?}

# Videos
GET    /api/v1/projects/:id/videos
GET    /api/v1/videos/:vid
GET    /api/v1/videos/:vid/preview-url     → presigned URL
POST   /api/v1/videos/:vid/trim            body: {startMs, endMs, mode}
POST   /api/v1/videos/:vid/export          body: {preset, ...}
DELETE /api/v1/videos/:vid

# Scenes
GET    /api/v1/videos/:vid/scenes
GET    /api/v1/scenes/:id/subtitle
PATCH  /api/v1/scenes/:id/subtitle
POST   /api/v1/scenes/:id/regenerate       body: {stage: 'image'|'video'|'voice', overridePrompt?}
POST   /api/v1/scenes/:id/subtitle/auto-generate
POST   /api/v1/scenes/:id/subtitle/burn-in

# API Keys (Module 3)
GET    /api/v1/api-sources
POST   /api/v1/api-sources                 body: {key, name?, capabilities[], providerHint?}
POST   /api/v1/api-sources/test            body: {key, capability}
PATCH  /api/v1/api-sources/:id
POST   /api/v1/api-sources/:id/reset-quota
DELETE /api/v1/api-sources/:id

# Notifications (Module 4)
GET    /api/v1/notifications               ?since=2026-05-01&type=error
PATCH  /api/v1/notifications/:id/read
PATCH  /api/v1/notifications/read-all
GET    /api/v1/notifications/telegram-config
PATCH  /api/v1/notifications/telegram-config
POST   /api/v1/notifications/telegram-test

# Frames (Module 5)
GET    /api/v1/projects/:id/frames
POST   /api/v1/frames                      body: {projectId, name}
PATCH  /api/v1/frames/:id                  body: {name?}
DELETE /api/v1/frames/:id
POST   /api/v1/frames/:id/images           multipart OR {url} OR {prompt, model, count}
DELETE /api/v1/frames/:id/images/:imgId
PATCH  /api/v1/frames/:id/reorder          body: {orderedIds[]}
POST   /api/v1/frames/:id/apply-as-intro   body: {videoId}

# Voices
GET    /api/v1/voices                      ?provider=edge-tts&language=vi-VN
POST   /api/v1/voices/preview              body: {voiceId, text, speed?, pitch?}

# Models metadata (cho ModelSelector)
GET    /api/v1/models                      → {script: [...], image: [...], video: [...]}

# Jobs (cho /jobs page)
GET    /api/v1/jobs                        ?queue=render&status=active
GET    /api/v1/jobs/:id
DELETE /api/v1/jobs/:id                    (cancel)

# Webhooks (n8n + worker callbacks, HMAC)
POST   /api/v1/webhooks/n8n/render-request
POST   /api/v1/webhooks/n8n/script-complete
POST   /api/v1/webhooks/worker/scene-progress
POST   /api/v1/webhooks/worker/render-complete
```

---

## 13. Implementation Checklist (master)

> Mỗi item link tới phase trong [plan.md](plan.md). `[x]` = done, `[~]` = partial, `[ ]` = todo.

### Layout & Navigation
- [x] TopBar với project switcher + theme + notification bell
- [x] Sidebar 6 module + project-aware disabled state
- [x] Theme dark/light toggle
- [x] Routing đầy đủ (12 page)

### Module 1 — Tạo Video
- [x] 1.1 Source tabs (YouTube/Báo/Truyện/Tự nhập) — 4 tab UI
- [x] 1.1 YouTube transcript fetch (yt-dlp)
- [ ] 1.1 Article parser (Readability)
- [x] 1.2 Voice config — Edge TTS Nam Minh
- [ ] 1.2 Voice multiple voices (Hoài My, ElevenLabs, OpenAI)
- [ ] 1.2 Voice preview button
- [x] 1.3 Character ref sheet UI
- [ ] 1.3 Character upload + AI gen
- [ ] 1.3 Character mention trong scene prompt
- [ ] 1.4 SubtitleEditor component
- [ ] 1.4 Whisper auto-generate sub
- [ ] 1.4 Burn-in sub re-render

### Module 2 — Quản lý Video
- [x] 2.1 Library grid view + status badge
- [ ] 2.1 Filter by status
- [ ] 2.1 Search by title
- [ ] 2.2 VideoTrimmer component
- [ ] 2.2 Trim job + output file
- [ ] 2.3 FormatExportModal — 4 preset
- [ ] 2.3 Export job + output file
- [ ] 2.4 Smart crop (OpenCV)

### Module 3 — Nguồn API
- [x] 3.1-3.3 Auto-detect provider từ key prefix
- [x] 3.1-3.3 Multi-capability checkbox
- [ ] 3.1-3.3 Test connection button
- [ ] 3.1-3.3 Reset quota button at row
- [ ] 3.1-3.3 Multi-key rotation BE logic
- [ ] 3.1-3.3 BE → n8n credential auto-sync

### Module 4 — Thông báo
- [x] 4.1 Telegram bot config form
- [x] 4.1 Send test message
- [ ] 4.1 Template variable preview
- [x] 4.2 In-app drawer + bell badge
- [x] 4.2 Tab filter + group by date
- [ ] 4.2 Click → navigate + mark read
- [ ] 4.2 Toast notifications system-wide
- [x] 4.3 Log settings UI
- [ ] 4.3 4 sink type implementations
- [ ] 4.3 Log table + download

### Module 5 — Quản lý Frame
- [x] 5.x Frame library list
- [x] 5.x Frame detail page
- [ ] 5.1 AI image generation with prompt
- [ ] 5.2 Drag-drop reorder
- [ ] 5.2 Upload từ file (MinIO multipart)
- [ ] 5.2 Paste URL → re-upload
- [ ] 5.2 Apply as intro/outro cho video

### Cross-cutting
- [x] Pipeline progress real-time qua Socket.IO
- [ ] Pipeline progress per-scene breakdown
- [ ] Error code chuẩn hoá BE → message tiếng Việt FE
- [ ] Toast notification thay alert/console
- [ ] Skeleton loading thay "Đang tải..."
- [ ] ETA estimation từ historical data

### Database
- [x] Prisma schema baseline
- [ ] Migration: Character, VideoExport, Subtitle, TelegramConfig, LogSink
- [ ] Migration: ApiKey thêm capabilities[], quotaUsedPct, n8nCredentialId
- [ ] Migration: Project thêm aiConfig, voiceConfig

### REST API
- [x] Projects CRUD
- [x] Videos GET/list
- [x] API Sources CRUD + auto-detect
- [x] Notifications GET + Telegram config
- [ ] Sources YouTube/Article (POST)
- [ ] Scenes regenerate + subtitle endpoints
- [ ] Videos trim + export
- [ ] Frames images CRUD + reorder
- [ ] Voices preview
- [ ] Models metadata endpoint

### Production
- [ ] Auth (NextAuth + JWT, deferred)
- [ ] Sentry FE + BE
- [ ] Prometheus metrics
- [ ] Daily backup pg_dump → MinIO

---

## 14. Out of Scope (v1)

- Avatar AI (Synthesia clone)
- Voice cloning trên-prem (XTTS/Bark)
- Multi-user / multi-tenant billing
- GraphQL
- Mobile native app
- Real-time collab (multi-user edit cùng video)
- Bulk import (Excel → 100 video)
- Auto-post YouTube/TikTok
- Analytics tracking từ social platforms
- A/B testing thumbnail/title

---

## 15. Verification per module (smoke test cuối)

| Module | Test |
|---|---|
| Layout | Sidebar disable đúng khi không có project; theme switch giữ qua reload |
| Module 1 | Paste YouTube URL → 5 phút sau có video play được trong /videos |
| Module 1.4 | Edit sub cue → save → re-render burn-in → video update |
| Module 2 | Trim 32s → 20s, output file mới appear; export TikTok 9:16 download được |
| Module 3 | Add 2 key Gemini, force key 1 expired → render success với key 2 (log "rotated") |
| Module 4 | Render xong → Telegram bot nhận message; lỗi quota → in-app drawer có notification |
| Module 5 | Upload 3 ảnh, drag reorder, apply as intro → video master có ảnh ở đầu |

---

**Bước tiếp theo**: chọn 1 module ưu tiên cao nhất → tôi viết PRD chi tiết hơn (user stories, edge cases, mock data) để bắt đầu implement.
