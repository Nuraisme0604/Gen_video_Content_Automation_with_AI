# Checklist hoàn thiện AI Video Tool

## Trạng thái audit

**27/33 nút FE hoạt động đúng (81%)** — phần lớn CRUD đã wired. Các vấn đề thực sự nằm ở:
1. Pipeline AI thực tế (Veo3 quota = 0 trên free Gemini)
2. Vài nút FE trống không có handler
3. Vài endpoint backend chưa được FE dùng

---

## 🔴 P0 — Blocking (cần fix để tool "đạt yêu cầu")

### 1. Pipeline AI thực tế chưa chạy được với free Gemini
| Tác vụ | Hiện tại | Vấn đề | Giải pháp |
|---|---|---|---|
| Script | ✅ Gemini 2.5 Flash | OK | giữ nguyên |
| Image gen | placeholder picsum | Imagen 4 cần **paid plan** | nâng cấp paid plan **HOẶC** dùng SD local |
| Video gen | ffmpeg slideshow | Veo3 cần **paid plan + billing** | nâng cấp Vertex AI **HOẶC** giữ slideshow |
| Voice | Edge TTS free | OK (đã thay ElevenLabs) | giữ nguyên |
| BGM | placeholder | ElevenLabs Music cần $22/tháng | skip hoặc dùng audio public domain |

**Quyết định cần:** Bạn có sẵn sàng upgrade Google AI sang paid không?
- **Có** → tôi sẽ đổi config sang Vertex AI, real Veo3 sẽ chạy
- **Không** → tôi tối ưu slideshow + Edge TTS để output đẹp hơn (transitions, captions, BGM stock)

### 2. Backend webhook callback từ Python worker chưa lưu masterVideoKey vào DB
- Hiện tại: video render xong nhưng `masterVideoKey` field trong DB không được update
- Frontend hiện tin tưởng `masterVideoKey` để show preview URL → cần fix worker → backend webhook

### 3. Auto upload master video lên MinIO (hiện chỉ lưu local /assets_temp)
- Cần: sau khi ffmpeg render xong, auto upload + update `masterVideoKey` qua webhook

---

## 🟠 P1 — Nút FE bị broken / orphaned

| Vị trí | Nút | Vấn đề | Fix |
|---|---|---|---|
| `/projects/[id]/create` | **💾 Lưu nháp** | Không có onClick, không có endpoint BE | Bỏ nút HOẶC implement endpoint `PATCH /sources/:id/draft` |
| `/notifications/settings` | Checkboxes "Sự kiện gửi thông báo" | UI-only, không persist | Lưu vào Project hoặc User config |
| `/notifications/settings` | Checkboxes "Đẩy log" | UI-only, không persist | Lưu vào config hoặc bỏ |
| `/notifications/settings` | Log level radio | UI-only | Lưu vào config hoặc bỏ |
| `/api-sources` | Reset quota | Endpoint có nhưng **thiếu UI button** | Thêm button "Reset quota" vào row table |
| `/jobs` | Filter queue/status | Backend support nhưng **không có UI** | Thêm filter dropdown |

---

## 🟡 P2 — Tính năng có trong design.md nhưng chưa code

| design.md | Trạng thái |
|---|---|
| 1.4 SubtitleEditor (per-scene .srt edit) | ❌ chưa có |
| 2.2 VideoTrimmer (timeline trim) | ❌ chưa có |
| 2.3 FormatExportModal (9:16/1:1/16:9) | ❌ chưa có |
| 2.4 VideoCropTool | ❌ chưa có |
| Project switcher dropdown ở TopBar | ⚠️ có select nhưng không hoạt động (chưa lưu activeProjectId) |
| Sub feature: Báo + Truyện input source tabs | ❌ design có 4 tab, hiện 2 tab |
| Notification template tin nhắn editor | ⚠️ hiển thị nhưng không edit được |

---

## 🟢 P3 — Polish / nâng cao

- [ ] Sync API keys: `/api-sources` add key → tự động tạo n8n credential (Option A đã đề xuất chưa code)
- [ ] Multi-key rotation khi quota hết (đã có `isActive` field, chưa có rotator logic)
- [ ] Toast notifications khi action success/fail
- [ ] Loading skeleton thay vì "Đang tải..."
- [ ] Frame: drag-drop reorder (BE đã có endpoint, FE chưa wire)
- [ ] Frame: upload ảnh từ file (BE chưa có S3 upload endpoint)

---

## Đề xuất thứ tự thực hiện

### Sprint 1 — Pipeline thật chạy được (P0)
1. Quyết định: Vertex AI paid hay slideshow free?
2. Wire master video upload MinIO + webhook callback `render-complete` → backend update `masterVideoKey`
3. Test end-to-end: tạo video → thấy video xuất hiện trong `/videos` với preview play được

### Sprint 2 — Fix nút broken (P1)
4. Bỏ nút "Lưu nháp" hoặc implement
5. Bỏ checkbox config trong `/notifications/settings` hoặc lưu thành `NotificationConfig` model
6. Thêm Reset Quota button + Job filter UI

### Sprint 3 — Hoàn thiện theo design.md (P2)
7. Project switcher real
8. Sub editor inline
9. (optional) Video trim/crop/format

### Sprint 4 — UX polish (P3)
10. Toast + skeleton + n8n credential auto-sync
