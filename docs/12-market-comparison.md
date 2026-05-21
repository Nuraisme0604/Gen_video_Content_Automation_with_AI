# 12 — Market Comparison

> So sánh AI Video Content Automation với các tools tương tự trên thị trường tính đến 2026. Mục đích: hiểu vị trí cạnh tranh + xác định feature gap.

## Phân loại sản phẩm

Repo này nằm ở giao thoa 3 loại tool:

```
        ┌───────────────────────┐
        │  AI Video Generation  │   ← Sora, Veo3 (API), Runway
        │  (vendor SaaS)        │
        └───────────────────────┘
                    │
        ┌───────────────────────┐
        │  Faceless Video       │   ← Pictory, InVideo, Synthesia,
This →  │  AI Tools (SaaS)      │     Fliki, Vidnoz, NoiseStash
        │                       │
        └───────────────────────┘
                    │
        ┌───────────────────────┐
        │  Self-hosted AI       │   ← n8n, Flowise, ComfyUI,
        │  Workflow Toolkit     │     AutoGen, CrewAI
        └───────────────────────┘
```

→ **Sản phẩm này là**: faceless video tool **self-hosted**, **multi-provider**, có **orchestration workflow** mở rộng được. Hiếm tool đáp ứng cả 3 thuộc tính cùng lúc.

## So sánh với competitors trực tiếp

| Feature | This repo | [Pictory](https://pictory.ai) | [InVideo AI](https://invideo.io) | [Fliki](https://fliki.ai) | [Synthesia](https://synthesia.io) | [Vidnoz](https://vidnoz.com) |
|---|---|---|---|---|---|---|
| **Pricing model** | Self-host (free + provider cost) | $19-99/mo | $25-99/mo | $21-66/mo | $22-67/mo | $14-89/mo |
| **Open source** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Multi-provider AI** | ✅ (7+) | ❌ (proprietary) | ❌ | ❌ | ❌ | ❌ |
| **YouTube URL → video** | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| **Bài báo URL → video** | ⚠️ paste only | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Script → video** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Avatar talking head** | ❌ | ❌ | ✅ | ❌ | ✅ (core) | ✅ |
| **Stock footage** | ✅ Pexels | ✅ Shutterstock+ | ✅ iStock+ | ✅ Pexels+ | ❌ | ✅ |
| **AI video generation (Veo/Sora-class)** | ✅ Veo3 | ❌ | ⚠️ (limited) | ❌ | ❌ | ⚠️ |
| **Voice cloning** | ⚠️ ElevenLabs | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Subtitle burn-in** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Subtitle visual editor** | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Trim/Crop editor** | ❌ | ✅ | ✅ | ⚠️ | ⚠️ | ✅ |
| **Multi-language voice** | ⚠️ 2 (vi/en edge-tts) | 50+ | 50+ | 75+ | 140+ | 100+ |
| **Aspect ratio (16:9 / 9:16 / 1:1)** | ✅ chọn upfront | ✅ post | ✅ post | ✅ post | ✅ post | ✅ post |
| **Brand kit (logo/font/color)** | ❌ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| **Templates** | ❌ | ✅ 1000+ | ✅ 5000+ | ✅ | ✅ | ✅ |
| **Auto-upload YouTube** | ⚠️ code có, OAuth chưa | ✅ | ✅ | ✅ | ❌ | ✅ |
| **API access** | ✅ (own NestJS) | ⚠️ paid plan | ⚠️ paid plan | ✅ paid | ✅ paid | ❌ |
| **Realtime progress UI** | ✅ Socket.IO | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Job queue / batch** | ✅ BullMQ | ⚠️ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| **Cost control / quota** | ✅ per-key | ❌ (flat plan) | ❌ | ❌ | ❌ | ❌ |
| **Self-host on prem** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Data privacy (own DB)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Multi-tenant** | ❌ (single-user v1) | ✅ team plan | ✅ team plan | ✅ team plan | ✅ enterprise | ✅ team |

### Tóm tắt SWOT vs competitors SaaS

**Điểm mạnh độc đáo (vs Pictory/InVideo/Fliki)**:
1. **Self-host & open** — không vendor lock-in, không lo bị tăng giá, không lo data leak
2. **Multi-provider AI** — chọn provider phù hợp từng stage, không bị ép dùng proprietary model thấp chất lượng
3. **Cost transparency** — thấy rõ cost từng video, quota per-key, không paywall ẩn
4. **Veo3 access ngay** — competitor SaaS chưa wire Veo3 vào pipeline core
5. **API toolkit thật** — full NestJS API public, dễ extend

**Điểm yếu (vs SaaS)**:
1. **Setup friction** — cần Docker + API keys + hiểu kỹ thuật cơ bản
2. **No template library** — competitors có 1000-5000 templates chuyên ngành
3. **No subtitle/trim/crop visual editor** — phải edit ngoài
4. **Voice + language ít hơn** — 2 vs 50-140
5. **No avatar talking head** — không có Synthesia-style presenter
6. **Single-user** — chưa có team/multi-tenant
7. **No brand kit** — không lưu logo/color/font reuse

## So sánh với self-hosted alternatives

| Feature | This repo | [ComfyUI](https://github.com/comfyanonymous/ComfyUI) | [n8n (raw)](https://n8n.io) | [Flowise](https://flowiseai.com) | [SillyTavern + AI Hub workflows](https://github.com/SillyTavern/SillyTavern) |
|---|---|---|---|---|---|
| Video output (mp4) | ✅ | ⚠️ workflow phức tạp | ❌ chỉ orchestrator | ❌ chỉ chatbot | ❌ |
| YouTube transcript input | ✅ | ❌ | ⚠️ tự build | ❌ | ❌ |
| Multi-AI provider | ✅ | ✅ node-based | ✅ rất linh hoạt | ✅ | ⚠️ |
| UI cho non-dev | ✅ | ❌ (node graph khó) | ⚠️ workflow UI | ⚠️ | ✅ |
| Đặc thù faceless video | ✅ | ❌ general | ❌ general | ❌ chat | ❌ chat |
| Database persistence | ✅ Postgres + Prisma | ⚠️ filesystem | ✅ Postgres | ⚠️ | ⚠️ |
| Storage S3 | ✅ MinIO | ❌ local | ⚠️ binary | ❌ | ❌ |
| Realtime UI | ✅ Socket.IO | ✅ | ⚠️ | ⚠️ | ✅ |

→ Self-hosted alternatives quá general (ComfyUI / n8n / Flowise) — chưa có ai opinionated cho **faceless YouTube/TikTok video pipeline** như repo này.

## Inspiration nên tham khảo cho roadmap

| Lấy cảm hứng từ | Feature | Ưu tiên |
|---|---|---|
| Pictory / InVideo | Subtitle visual editor (timeline drag, click-to-edit, style preset) | P1 — đã có trong [08-roadmap.md](08-roadmap.md) Phase 2.1 |
| InVideo / Fliki | Template library (preset niche: news, story, education, fitness, ...) | P2 |
| Fliki / Synthesia | Voice variety + cloning (>10 ngôn ngữ) | P1 — Phase 3.4 roadmap |
| Pictory | Brand kit (logo/color/font lưu reuse) | P2 |
| InVideo | Auto-music selection theo mood | P3 — Phase 3.3 roadmap |
| Synthesia | Avatar talking head (nếu user muốn) | P3 |
| Synthesia / Fliki | Multi-aspect-ratio export 1 lần (output cả 16:9 + 9:16) | P2 |
| ComfyUI | Workflow node editor để user customize pipeline | P3 (đã có n8n nhưng UI bên ngoài) |
| AutoGen / CrewAI | Multi-agent quality scoring (auto-review video trước khi publish) | P3 |

## Differentiators nên giữ (đừng bỏ)

1. **Self-host first** — đừng chuyển sang SaaS managed
2. **Multi-provider rotation** — đừng lock vào 1 vendor
3. **Cost transparency** — luôn hiển thị cost per video + quota tracking
4. **Free path hoạt động được** — đừng break "docker compose up + Gemini free → output mp4"
5. **Open API** — đừng đóng API, để power user extend

## Pricing nếu commercialize

Nếu sản phẩm này muốn ra thị trường (vs giữ open-source self-host), benchmark:

- **Cloud-hosted version**: $9-29/mo (rẻ hơn Pictory $19) → target "tôi không muốn tự host"
- **Pay-as-you-go**: per-video pricing (vd $0.50/video assembly + provider cost passthrough)
- **Enterprise self-host**: $499-1999/year + support contract
- **Always-free tier**: Self-host community edition giữ nguyên (như hiện tại)

## Conclusion

Repo này có niche rõ ràng: **opinionated faceless video pipeline cho power user kỹ thuật muốn tự host + đa cung cấp**. Không cạnh tranh trực tiếp với Pictory/InVideo về template/brand kit mà cạnh tranh ở **chi phí + tự chủ + multi-AI**.

Để cạnh tranh tốt hơn với SaaS, top 3 ưu tiên (theo gap analysis):
1. **Subtitle visual editor** (deal-breaker đối với content creator non-technical)
2. **Template library + brand kit** (giảm setup time đáng kể)
3. **Voice variety** (nâng từ 2 lên ít nhất 10 ngôn ngữ)

→ Đã có trong [08-roadmap.md](08-roadmap.md) Phase 2-3.

## Liên quan

- [10-product-spec.md](10-product-spec.md) — feature inventory từ code
- [11-feature-checklists.md](11-feature-checklists.md) — what's done vs todo
- [08-roadmap.md](08-roadmap.md) — implementation plan cho gaps
