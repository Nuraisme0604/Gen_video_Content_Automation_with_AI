# 📚 Documentation Index

Tài liệu thiết kế của **AI Video Content Automation** — gom tất cả docs vào 1 chỗ, đánh số theo chủ đề.

## Mục lục

| # | Chủ đề | File | Mô tả |
|---|---|---|---|
| 01 | Overview | [01-overview.md](01-overview.md) | Giới thiệu, mục tiêu sản phẩm, persona |
| 02 | Architecture | [02-architecture.md](02-architecture.md) | Container diagram, stack 7 services, phân chia trách nhiệm |
| 03 | Data Model | [03-data.md](03-data.md) | ERD Prisma, 13 models + 2 enums, relations |
| 04 | API Reference | [04-api.md](04-api.md) | TOC routes BE NestJS, webhook contracts |
| 05 | Pipeline Flow | [05-pipeline.md](05-pipeline.md) | Sequence diagram E2E: FE → BE → n8n → Gemini → Worker |
| 06 | Deployment | [06-deployment.md](06-deployment.md) | Cài đặt + vận hành + troubleshooting |
| 07 | UX Design | [07-ux-design.md](07-ux-design.md) | Full design spec 78KB — UX/UI per module (chi tiết) |
| 08 | Roadmap | [08-roadmap.md](08-roadmap.md) | Plan triển khai theo phase, prioritization |
| 10 | Product Spec | [10-product-spec.md](10-product-spec.md) | **Mô tả sản phẩm dựa trên code thực tế** (modules, features, limits) |
| 11 | **Checklist (single source)** | [11-feature-checklists.md](11-feature-checklists.md) | **Tất cả tasks** gộp 1 chỗ — Quick wins + P0/P1/P2/P3 + per-feature, có file path + verify |
| 12 | Market Comparison | [12-market-comparison.md](12-market-comparison.md) | **So sánh với competitors** (Pictory, InVideo, Fliki, Synthesia, ComfyUI...) |

### Setup guides (provider-specific)
- [setup-api-keys.md](setup-api-keys.md) — Hướng dẫn lấy API key của từng provider (Google AI Studio, OpenAI, ElevenLabs, ...)
- [setup-vertex-ai.md](setup-vertex-ai.md) — Setup Google Vertex AI riêng (Veo3, Imagen với paid plan)

## Đọc theo vai trò

| Bạn là... | Đọc theo thứ tự |
|---|---|
| 🆕 **Người mới onboard** | 01 → 10 → 02 → 06 → setup-api-keys |
| 🛠️ **Dev backend/frontend** | 02 → 03 → 04 → 05 → 11 |
| 🎨 **Designer / PM** | 01 → 10 → 07 → 12 → 08 |
| 🚀 **DevOps** | 02 → 06 → setup-vertex-ai |
| 📋 **QA / Tester** | 11 → 05 → 04 |
| 📊 **Stakeholder / Đánh giá** | 10 → 12 → 11 |

## Nguyên tắc tổ chức

- **Files đánh số `01-09`** — chủ đề chính, đọc theo thứ tự cho onboarding
- **Files `setup-*`** — hướng dẫn provider/dịch vụ cụ thể, đọc khi cần
- Root `Readme.md` ở repo gốc vẫn giữ — là tóm tắt GitHub-facing, link sang `/docs/` cho chi tiết
- `Claude.md` ở root là behavior guide cho Claude Code, KHÔNG phải tài liệu thiết kế
