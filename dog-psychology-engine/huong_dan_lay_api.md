# Hướng dẫn lấy API keys — AI YouTube Content Engine

Tài liệu này hướng dẫn từng bước lấy API keys cần thiết để chạy engine.

> **TL;DR**: Bạn chỉ cần đăng ký **4 service** là đủ chạy:
> 1. OpenAI (text + image)
> 2. Anthropic (script refine)
> 3. ElevenLabs (voice + music — 1 key dùng cả 2)
> 4. Google AI Studio (Veo3 video + YouTube channel analysis — có thể share 1 key)
>
> Optional: YouTube OAuth (auto-upload), Telegram Bot (notify), Runway (alternative video).

---

## Mục lục

| # | Service | Bắt buộc? | Free? | Mục |
|---|---|---|---|---|
| 1 | OpenAI | ✅ | ❌ Trả phí | [§1](#1-openai-script--scene-breakdown--qa--seo--image) |
| 2 | Anthropic Claude | ✅ | ❌ Trả phí | [§2](#2-anthropic-claude-refine-script) |
| 3 | ElevenLabs | ✅ | ⚠️ Free voice / paid music | [§3](#3-elevenlabs-voice--music) |
| 4 | Google AI Studio (Veo3) | ✅ | ❌ Trả phí (có free tier nhỏ) | [§4](#4-google-ai-studio-veo3-video-generation) |
| 5 | YouTube Data API v3 | ✅ | ✅ Free (10k units/day) | [§5](#5-youtube-data-api-v3-phân-tích-kênh-tham-chiếu) |
| 6 | YouTube OAuth2 (upload) | Optional | ✅ Free | [§6](#6-youtube-oauth2-upload-video) |
| 7 | Telegram Bot | Optional | ✅ Free | [§7](#7-telegram-bot-notification) |
| 8 | Runway (alternative video) | Optional | ❌ Trả phí | [§8](#8-runway-alternative-video-provider) |

---

## 1. OpenAI (script + scene breakdown + QA + SEO + image)

**Dùng để:**
- Generate topic + outline (GPT-5.4-mini)
- Viết kịch bản thô (GPT-5.4-mini)
- QA chấm điểm (GPT-5.4-mini)
- Chia kịch bản thành scenes (GPT-5.4-mini)
- Tạo SEO metadata (GPT-5.4-mini)
- Generate ảnh scene + thumbnail (gpt-image-2)

**Chi phí**: ~$3-6/video (text + image)

**Cách lấy:**

1. Truy cập **https://platform.openai.com/api-keys**
2. Đăng ký account (nếu chưa có)
3. **Billing → Add payment method** → nạp ≥ $20 vào balance
   - Free trial $5 không đủ vì gpt-image-2 yêu cầu **API Organization Verification**
4. **Settings → Organization → General → Verify Organization** (cần cho image generation)
5. Quay lại **API keys → Create new secret key**
6. Đặt tên: "content-engine"
7. **Copy key** (chỉ hiện 1 lần!) — dạng `sk-proj-...` hoặc `sk-...`

**Điền vào `.env`:**
```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_TEXT_MODEL=gpt-5.4-mini       # Default, KHÔNG cần đổi
OPENAI_IMAGE_MODEL=gpt-image-2       # Default
```

**Verify**:
```bash
curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY" | head
# Expect: JSON list of models
```

---

## 2. Anthropic Claude (refine script)

**Dùng để**: Viết lại kịch bản thô của GPT để tăng retention + emotional impact (Claude Opus 4.7)

**Chi phí**: ~$0.5/video (1 call/video, ~3000 từ output)

**Cách lấy:**

1. Truy cập **https://console.anthropic.com**
2. Đăng ký với Google/email
3. **Plans & Billing → Add payment method** → nạp ≥ $10
4. **Settings → API Keys → Create Key**
5. Đặt tên: "content-engine"
6. **Copy key** — dạng `sk-ant-api03-...`

**Điền vào `.env`:**
```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx
CLAUDE_MODEL=claude-opus-4-7         # Default newest. Cheaper alt: claude-sonnet-4-6
```

**Verify**:
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-opus-4-7","max_tokens":10,"messages":[{"role":"user","content":"hi"}]}'
# Expect: response với content[0].text
```

---

## 3. ElevenLabs (voice + music)

**Dùng để**:
- Voiceover narration (`eleven_multilingual_v2`) — TTS chất lượng cao
- BGM instrumental khớp emotion (`music_v1`) — AI music

**Chi phí**: Free 10k chars/month cho voice. Music API yêu cầu **Creator plan** ($22/tháng) trở lên.

**Cách lấy:**

### 3.1 API Key
1. Truy cập **https://elevenlabs.io**
2. Đăng ký account
3. (Nếu cần music) Subscribe Creator plan tại **Subscription**
4. Click avatar (góc phải trên) → **Profile → API Keys**
5. **Create API Key** — đặt tên "content-engine"
6. **Copy** — dạng `sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 3.2 Voice ID
1. Vào **Voice Library** (https://elevenlabs.io/app/voice-library)
2. Filter language: chọn ngôn ngữ kịch bản (Vietnamese / English / etc.)
3. Click **Add to my voices** trên voice yêu thích
4. Vào **My Voices** → click voice vừa add → copy `Voice ID` (dạng `21m00Tcm4TlvDq8ikWAM`)

**Điền vào `.env`:**
```env
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
ELEVENLABS_MODEL=eleven_multilingual_v2
ELEVENLABS_MUSIC_MODEL=music_v1
```

> ⚠️ Nếu plan free (không có music): set `MUSIC_PROVIDER=static` trong `.env` để dùng BGM mp3 mặc định thay vì gọi music API.

**Verify**:
```bash
curl https://api.elevenlabs.io/v1/user -H "xi-api-key: $ELEVENLABS_API_KEY"
# Expect: JSON user info với subscription tier
```

---

## 4. Google AI Studio (Veo3 video generation)

**Dùng để**: Generate video clip ~8s mỗi scene (Veo 3.1 with native audio)

**Chi phí**: ~$0.4-0.5/clip × ~110 clips = $40-55/video. Có thể dùng `veo-3.1-fast-generate-preview` để rẻ hơn.

**Cách lấy:**

1. Truy cập **https://aistudio.google.com**
2. Đăng nhập với Google account
3. Click **Get API key** (góc trái trên)
4. **Create API key** → chọn project hoặc create new
5. **Copy key** — dạng `AIzaSy...`

> ⚠️ **Quan trọng**: Veo3 yêu cầu **billing account active** trên Google Cloud Console. Tier 1 đủ để test, nhưng phải có credit card.

> 💡 **Tip**: Cùng key này có thể dùng cho cả **YouTube Data API v3** (§5) nếu enable cùng project → tiết kiệm 1 key.

**Điền vào `.env`:**
```env
GOOGLE_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
VEO3_MODEL=veo-3.1-generate-preview
VIDEO_PROVIDER=veo3
```

**Verify**:
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GOOGLE_API_KEY" | head
# Expect: JSON list of models bao gồm veo-3.1-*
```

---

## 5. YouTube Data API v3 (phân tích kênh tham chiếu)

**Dùng để**: Fetch dữ liệu thật của kênh YouTube tham chiếu (subscribers, top 10 videos, titles, views) → GPT phân tích pattern.

**Chi phí**: **Free** 10,000 units/ngày (đủ phân tích ~50 kênh/ngày).

**Cách lấy:**

1. Truy cập **https://console.cloud.google.com**
2. **Create new project** (hoặc dùng project có Veo3 ở §4 — share key)
3. Sidebar → **APIs & Services → Library**
4. Search **"YouTube Data API v3"** → click → **Enable**
5. Sidebar → **APIs & Services → Credentials**
6. **+ Create Credentials → API key**
7. **Copy key** — dạng `AIzaSy...`

> 💡 Để bảo mật: click vào key vừa tạo → **Application restrictions → HTTP referrers** (chỉ cho phép nếu bạn deploy public). Hoặc **API restrictions → Restrict key** → chọn chỉ "YouTube Data API v3".

**Điền vào `.env`:**
```env
YOUTUBE_DATA_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# Có thể là cùng key với GOOGLE_API_KEY nếu cùng project Cloud Console
```

> ⚠️ Nếu thiếu key này, GPT sẽ **không phân tích kênh thật** mà chỉ generate topic dựa trên `CHANNEL_NICHE` → kết quả kém liên quan đến kênh tham chiếu.

**Verify**:
```bash
curl "https://www.googleapis.com/youtube/v3/channels?part=snippet&forUsername=Google&key=$YOUTUBE_DATA_API_KEY"
# Expect: JSON channel info
```

---

## 6. YouTube OAuth2 (upload video)

**Dùng để**: Auto-upload final video lên kênh YouTube của bạn (private draft mặc định).

**Chi phí**: Free.

**Setup phức tạp** — đây là phần khó nhất, làm tuần tự.

### 6.1 Tạo OAuth Client ID

1. Truy cập **https://console.cloud.google.com** (cùng project ở §5)
2. Sidebar → **APIs & Services → Library** → search "YouTube Data API v3" → đảm bảo đã **Enable**
3. Sidebar → **APIs & Services → OAuth consent screen**
4. **User Type: External** → Create
5. Fill:
   - App name: "Content Engine"
   - User support email: email của bạn
   - Developer contact: email của bạn
6. **Scopes → Add or Remove Scopes** → search và tick:
   - `.../auth/youtube.upload`
   - `.../auth/youtube.readonly`
7. **Test users → Add users** → thêm email của kênh YouTube bạn muốn upload
8. Save và Continue

9. Sidebar → **APIs & Services → Credentials**
10. **+ Create Credentials → OAuth client ID**
11. **Application type: Web application**
12. **Authorized redirect URIs → Add URI**: `https://developers.google.com/oauthplayground`
13. Create → **Copy Client ID + Client Secret**

### 6.2 Lấy Refresh Token (qua OAuth Playground)

1. Truy cập **https://developers.google.com/oauthplayground**
2. Click ⚙️ icon (góc phải) → tick **"Use your own OAuth credentials"**
3. Paste **Client ID** + **Client Secret** từ §6.1
4. Close
5. **Step 1**: Trong list scopes bên trái:
   - Tìm hoặc paste vào input box: `https://www.googleapis.com/auth/youtube.upload`
   - Click **Authorize APIs**
6. Đăng nhập Gmail của kênh YouTube → Allow
7. **Step 2: Exchange authorization code for tokens** → click button
8. **Copy `Refresh token`** — dạng `1//0e...`

### 6.3 Điền vào `.env`

```env
YOUTUBE_CLIENT_ID=xxxxxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxxxx
YOUTUBE_REFRESH_TOKEN=1//0exxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
YOUTUBE_PRIVACY_STATUS=private       # private | unlisted | public
YOUTUBE_CATEGORY_ID=22                # 22 = People & Blogs
```

> 💡 Refresh token **không hết hạn** (trừ khi user revoke hoặc app status = Testing > 7 ngày). Nếu app ở Testing mode, sau 7 ngày phải re-auth. Move app to **Production** trong OAuth consent screen để token vĩnh viễn.

**Verify**: Worker sẽ tự test khi upload video đầu tiên. Nếu fail, check logs.

---

## 7. Telegram Bot (notification)

**Dùng để**: Push notification khi render xong / thất bại + gửi thumbnail preview.

**Chi phí**: Free.

**Cách lấy:**

### 7.1 Tạo Bot

1. Mở Telegram → search **`@BotFather`**
2. `/newbot`
3. Nhập tên (ví dụ "My Content Engine Bot")
4. Nhập username (phải kết thúc với `_bot`, ví dụ `mycontent_engine_bot`)
5. **Copy Bot Token** — dạng `123456789:ABCdefGhIjKlMnOpQrStUvWxYz`

### 7.2 Lấy Chat ID

1. Search bot vừa tạo → Start
2. Gửi 1 message bất kỳ (ví dụ "hi")
3. Mở browser: `https://api.telegram.org/bot<BOT_TOKEN>/getUpdates`
4. Tìm `"chat":{"id":123456789,...}` → copy số đó

**Điền vào `.env`:**
```env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIjKlMnOpQrStUvWxYz
TELEGRAM_CHAT_ID=123456789
```

**Verify**:
```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage?chat_id=$TELEGRAM_CHAT_ID&text=test"
# Expect: bot gửi "test" message vào chat
```

---

## 8. Runway (alternative video provider)

**Dùng nếu**: Bạn không muốn dùng Veo3 (Google billing setup phức tạp). Runway Gen-4 Turbo là alternative.

**Chi phí**: ~$0.5/clip 8s (đắt hơn Veo3 ~10×).

**Cách lấy:**

1. Truy cập **https://dev.runwayml.com**
2. Đăng ký developer account (yêu cầu approve, có thể đợi 1-2 ngày)
3. Buy credits ≥ $50
4. **API Keys → Create**
5. Copy key

**Điền vào `.env`:**
```env
VIDEO_PROVIDER=runway
VIDEO_API_KEY=key_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
VIDEO_API_URL=https://api.dev.runwayml.com/v1/text_to_video
VIDEO_MODEL=gen4_turbo
```

> ⚠️ Runway image-to-video có endpoint riêng (chưa wire trong code). Hiện tại chỉ text-to-video.

---

## 9. Tóm tắt minimal `.env`

Sau khi lấy đủ keys ở §1-§5, file `.env` của bạn cần ít nhất:

```env
# === CHANNEL CONFIG ===
CHANNEL_NAME=My Channel
CHANNEL_NICHE=cooking
CHANNEL_URL=https://www.youtube.com/@channel_to_analyze
CHANNEL_LANGUAGE=Vietnamese
TARGET_DURATION_MINUTES=15

# === API KEYS — REQUIRED ===
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
ELEVENLABS_API_KEY=sk_...
ELEVENLABS_VOICE_ID=...
GOOGLE_API_KEY=AIzaSy...
YOUTUBE_DATA_API_KEY=AIzaSy...      # Có thể giống GOOGLE_API_KEY

# === API KEYS — OPTIONAL ===
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# === DATABASE — KEEP DEFAULTS ===
POSTGRES_USER=user
POSTGRES_PASSWORD=changeme_in_prod
POSTGRES_DB=content_engine
DATABASE_URL=postgresql://user:changeme_in_prod@postgres:5432/content_engine
```

> ✅ **Test mà KHÔNG có YouTube OAuth + Telegram**: Pipeline vẫn render thành công, chỉ:
> - Không upload tự động lên YouTube (file local có sẵn ở `assets_temp/final_output/`)
> - Không có notification (xem qua `docker compose logs -f python_worker`)

---

## 10. Tổng chi phí ước tính (1 video 15 phút)

| Service | Min | Max |
|---|---|---|
| Setup (1 lần) | $0 (free tier) | ~$50 (Anthropic + OpenAI prepay) |
| GPT-5.4-mini text | $0.50 | $1.50 |
| Claude Opus 4.7 refine | $0.30 | $0.80 |
| gpt-image-2 (110+ images) | $2 | $5 |
| ElevenLabs voice | $0.50 | $1.50 |
| ElevenLabs Music BGM | $0.20 | $0.40 |
| **Veo 3.1 video** | **$30** | **$55** |
| YouTube Data API | Free | Free |
| YouTube Upload | Free | Free |
| Telegram | Free | Free |
| **Total / video** | **~$33** | **~$65** |

> 💡 **Tiết kiệm 50% chi phí**: Dùng `veo-3.1-fast-generate-preview` thay `veo-3.1-generate-preview` (~$0.20/clip thay vì $0.40-0.50).

---

## 11. FAQ thường gặp

**Q: Tôi không có credit card quốc tế, làm sao trả OpenAI/Anthropic?**
A: Có thể dùng:
- Wise / Revolut / Cake virtual card (hỗ trợ thanh toán nước ngoài)
- Hoặc proxy qua dịch vụ Việt Nam: Aishopvn, Paykey, ezBuy (markup ~10-15%)

**Q: Free tier có chạy được không?**
A: KHÔNG cho production:
- OpenAI free $5 không đủ cho 1 video
- Anthropic không có free tier
- ElevenLabs free 10k chars chỉ đủ ~5 phút voiceover
- Veo3 yêu cầu billing active

Free tier OK cho **setup + 1 test run** với video 5 phút.

**Q: Veo3 quá đắt, có alternative không?**
A:
- `veo-3.1-fast-generate-preview` — rẻ hơn ~50%, chất lượng kém hơn nhẹ
- Runway Gen-4 Turbo — đắt hơn ~10× nhưng dễ setup
- Skip video generation: set `VIDEO_PROVIDER=runway` và để empty key → worker sẽ skip, video chỉ có ảnh tĩnh + voiceover (slideshow style, rẻ nhất)

**Q: Lỗi "Organization Verification required" cho gpt-image-2?**
A: Vào https://platform.openai.com/settings/organization/general → **Verify Organization** (cần ID chính phủ). Verification mất 1-3 ngày.

**Q: Refresh token YouTube hết hạn liên tục?**
A: App đang ở **Testing mode** trên OAuth consent screen. Move sang **Production** để token vĩnh viễn (nếu app chỉ dùng cho cá nhân, không cần Google audit).

**Q: Có cách nào test pipeline không cần API keys không?**
A: Có thể spin up infra (postgres + n8n + worker) với `.env.example` placeholder values, nhưng pipeline sẽ fail ngay khi gọi external API. Workflow node sẽ throw 401/403 error. Hữu ích để test infrastructure layer (Docker network, n8n credentials, Postgres connectivity).

---

## 12. Tham khảo

- [OpenAI API docs](https://platform.openai.com/docs)
- [Anthropic Claude API docs](https://docs.anthropic.com)
- [ElevenLabs API docs](https://elevenlabs.io/docs/api-reference)
- [ElevenLabs Music compose endpoint](https://elevenlabs.io/docs/api-reference/music/compose)
- [Google AI Studio (Gemini API)](https://ai.google.dev/gemini-api/docs)
- [Veo 3.1 video generation](https://ai.google.dev/gemini-api/docs/video)
- [YouTube Data API v3](https://developers.google.com/youtube/v3/docs)
- [YouTube OAuth2 setup](https://developers.google.com/youtube/v3/guides/auth/installed-apps)
- [OAuth Playground](https://developers.google.com/oauthplayground)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [Runway API docs](https://docs.dev.runwayml.com)
