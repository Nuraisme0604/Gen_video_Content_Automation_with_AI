Thiết kế giao diện ban đầu — AI Video Content Tool
1. Layout tổng thể
┌─────────────────────────────────────────────────────────────────────────┐
│ [≡] AI Video Tool    [Dự án ▼]  [Sản phẩm ▼]    [VN ▼] [🔔3] [👤]      │  ← Top bar
├──────────┬──────────────────────────────────────────────────────────────┤
│          │                                                              │
│ SIDEBAR  │                  MAIN WORKSPACE                              │
│ (240px)  │                                                              │
│          │                                                              │
│          │                                                              │
├──────────┴──────────────────────────────────────────────────────────────┤
│ STATUS BAR: ● 3 jobs running · Veo queue: 5 · Last sync: 2m ago         │
└─────────────────────────────────────────────────────────────────────────┘


2. Sidebar (5 module khớp với sơ đồ)
┌────────────────────┐
│ 📁 DỰ ÁN           │  ← Project switcher
│   báo  ▼           │
│                    │
│ ─────────────────  │
│                    │
│ 🎬 Tạo video       │  ← Module 1: Tạo video
│ 📋 Quản lý video   │  ← Module 2
│ 🔌 Nguồn API       │  ← Module 3
│ 🔔 Thông báo       │  ← Module 4
│ 🖼️  Quản lý frame  │  ← Module 5
│                    │
│ ─────────────────  │
│                    │
│ ⚙️  Cài đặt        │
│ 🔑 API Keys        │
│ 📊 Logs            │
└────────────────────┘


3. Trang chính: Tạo video (màn hình quan trọng nhất)
┌─────────────────────────────────────────────────────────────────────────┐
│  Tạo video mới                                              [+ Lưu mẫu] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ NGUỒN ĐẦU VÀO ──────────────────────────────────────────────────┐  │
│  │  [📺 YouTube] [📰 Báo] [📖 Truyện] [✍️ Tự nhập]                  │  │  ← Tabs
│  │                                                                  │  │
│  │  🔗 https://youtube.com/watch?v=...                  [Phân tích] │  │
│  │  ⚠️  Bạn chịu trách nhiệm về bản quyền nội dung tham khảo        │  │
│  │                                                                  │  │
│  │  Mô tả thêm (tuỳ chọn):                                          │  │
│  │  ┌────────────────────────────────────────────────────────────┐  │  │
│  │  │ Văn phong dí dỏm, hướng đến gen Z...                       │  │  │
│  │  └────────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─ CẤU HÌNH AI ────────────────────────────────────────────────────┐  │
│  │  Script:    [GPT-5.4-mini ▼]    Refine:  [Claude Opus 4.7 ▼]    │  │
│  │  Ảnh:       [gpt-image-2 ▼]     Video:   [Veo 3.1 ▼]            │  │
│  │  Voice:     [ElevenLabs ▼]      BGM:     [ElevenLabs Music ▼]   │  │
│  │  Ngôn ngữ:  [🇻🇳 Tiếng Việt ▼]  Sub:     [☑ Có sub]             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─ NHÂN VẬT (Character Consistency) ───────────────────────────────┐  │
│  │  ┌──────┐  MAN: Caucasian male, 30s, dark beard...    [Sửa]     │  │
│  │  │ 👤   │                                              [Thay ảnh]│  │
│  │  └──────┘                                                        │  │
│  │  ┌──────┐  DOG: small Cockapoo, cinnamon-colored...   [Sửa]     │  │
│  │  │ 🐕   │                                              [Thay ảnh]│  │
│  │  └──────┘                                                        │  │
│  │  [+ Thêm nhân vật]                                               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│              [💾 Lưu nháp]      [▶ Sinh kịch bản & Tạo video]          │
└─────────────────────────────────────────────────────────────────────────┘


4. Sau khi sinh kịch bản — Scene Editor
┌─────────────────────────────────────────────────────────────────────────┐
│  Kịch bản: "Người quê" · 12 cảnh · ⏱ ~3:24                             │
│  [▶ Chạy tất cả] [✏️ Sửa lỗi] [🔁 Chạy lại lỗi] [+ Thêm cảnh] [🎬 Ghép]│
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─ Cảnh 1 ─────────────────────────────────────── ☑ chọn  [⋮ menu]┐  │
│  │  ┌────────┐  📝 VIDEO PROMPT                                     │  │
│  │  │ [thumb]│  hyper-realistic photography, MAN preparing steak... │  │
│  │  │  ▶     │  [Sửa prompt]                                        │  │
│  │  └────────┘                                                      │  │
│  │             🔊 AUDIO/TTS: "Hôm nay tôi sẽ kể..."     [▶ nghe]    │  │
│  │             🎵 BGM: ASMR sizzling                                │  │
│  │             ─────────────────────────────────────────            │  │
│  │             Status: ✅ Done · Veo job #4821 · 8.2s · 1080p       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─ Cảnh 2 ─────────────────────────────────────── ☐ chọn  [⋮]    ┐  │
│  │  ⏳ Đang sinh video... (Veo queue: 2/5)            [Hủy]         │  │
│  │  ████████████░░░░░░░░  60%                                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌─ Cảnh 3 ─────────────────────────────────────── ☐ chọn  [⋮]    ┐  │
│  │  ❌ Lỗi: Veo API timeout                          [Chạy lại]    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ... (cảnh 4-12)                                                        │
└─────────────────────────────────────────────────────────────────────────┘


5. Quản lý video (kho đầu ra)
┌─────────────────────────────────────────────────────────────────────────┐
│  Video đã tạo                          [🔍 Tìm...] [Lọc ▼] [+ Tạo mới] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐                                │
│  │ thumb│  │ thumb│  │ thumb│  │ thumb│        ← Grid view             │
│  │  ▶   │  │  ▶   │  │  ▶   │  │  ▶   │                                │
│  └──────┘  └──────┘  └──────┘  └──────┘                                │
│  Người quê  Báo #12  Truyện-A  Stickman                                 │
│  3:24 · ✅  2:10 · ✅ 5:00 · ⏳ 1:45 · ✅                                │
│                                                                         │
│  Khi click 1 video → mở panel:                                          │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  [Preview player]                                                │  │
│  │  ─────────────────────────────────────────────────               │  │
│  │  🎞️  Cắt/Crop      📐 Định dạng (9:16, 16:9, 1:1)               │  │
│  │  🎬 Ghép cảnh      📥 Tải xuống    📋 Copy prompt               │  │
│  │  🗑️  Xoá          ↗️ Xuất sang...                               │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘


6. Nguồn API (quản lý keys)
┌─────────────────────────────────────────────────────────────────────────┐
│  Nguồn API                                              [+ Thêm key]    │
├─────────────────────────────────────────────────────────────────────────┤
│  Tab: [Kịch bản] [Ảnh] [Video] [Voice]                                  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ Provider     Key (masked)        Quota         Status   Action   │  │
│  │ ───────────────────────────────────────────────────────────────  │  │
│  │ OpenAI       sk-...4f2a          82/100 req/m  🟢 OK   [Sửa]   │  │
│  │ Anthropic    sk-ant-...9b1       45/200 req/m  🟢 OK   [Sửa]   │  │
│  │ Veo (GCP)    ya29...x7q          12/50 jobs/d  🟡 Cao  [Sửa]   │  │
│  │ ElevenLabs   xi-...3e8           8K/30K char   🟢 OK   [Sửa]   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  💡 Hệ thống tự xoay vòng khi 1 key đạt giới hạn                       │
└─────────────────────────────────────────────────────────────────────────┘


7. Quản lý frame
┌─────────────────────────────────────────────────────────────────────────┐
│  Frame thư viện · Dự án: báo                       [+ Tạo frame mới]   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Frame: "Intro nền xanh"                                                │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐            │
│  │ ảnh1 │  │ ảnh2 │  │ ảnh3 │  │ ảnh4 │  │ ảnh5 │  │  +   │            │
│  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘            │
│   [✏️][🗑️]                                                              │
│                                                                         │
│  Frame: "Outro CTA"                                                     │
│  ┌──────┐  ┌──────┐  ┌──────┐                                          │
│  │ ảnh1 │  │ ảnh2 │  │  +   │                                          │
│  └──────┘  └──────┘  └──────┘                                          │
│                                                                         │
│  [Sinh video từ frame đã chọn →]                                        │
└─────────────────────────────────────────────────────────────────────────┘


8. Thông báo & Logs (drawer bên phải)
                                             ┌─────────────────────────┐
                                              │  🔔 Thông báo       [×] │
                                              ├─────────────────────────┤
                                              │  Tab: [Tất cả][Lỗi][TG] │
                                              │                         │
                                              │  ✅ 14:32                │
                                              │  Video "Người quê"      │
                                              │  hoàn thành (12/12)     │
                                              │                         │
                                              │  ❌ 14:28                │
                                              │  Cảnh 3 lỗi: Veo timeout│
                                              │  [Chạy lại]             │
                                              │                         │
                                              │  📤 14:15                │
                                              │  Đã đẩy log Telegram    │
                                              │                         │
                                              │  ⚙️ Cấu hình:           │
                                              │  ☑ Telegram bot         │
                                              │  ☑ In-app toast         │
                                              │  ☑ Đẩy log file         │
                                              └─────────────────────────┘


9. Design tokens (shadcn/ui + Tailwind)
Element
Value
Theme
Dark default (giữ phong cách tool hiện tại), có toggle light
Primary
Violet 600 (giống nút "Phân tích" hiện tại)
Success
Emerald 500
Warning
Amber 500
Danger
Rose 500
Font
Inter (UI) + JetBrains Mono (prompts/keys)
Radius
rounded-xl cho card, rounded-lg cho button
Spacing
4/8/16/24 grid

10. Khác biệt so với UI hiện tại
Hiện tại
Mới
Sidebar nhồi nhiều thứ (license, keys, NST, dừng)
Tách: nav module ở sidebar, settings/keys vào trang riêng
Không có Project switcher rõ ràng ở top
Top bar có Project + Sản phẩm cố định
Lỗi cảnh hiển thị trong list dài, khó scan
Card cảnh có status badge + action ngay tại chỗ
Không có dashboard tổng quan
Có Status bar dưới + drawer thông báo
Setting AI nằm rải rác
Gom vào 1 panel "Cấu hình AI" mỗi project

11. Routing đề xuất (Next.js App Router)
/                        → redirect to /projects
/projects                → list projects
/projects/[id]           → dashboard project (overview)
/projects/[id]/create    → tạo video (màn hình 3-4)
/projects/[id]/videos    → quản lý video (màn hình 5)
/projects/[id]/frames    → quản lý frame (màn hình 7)
/api-sources             → nguồn API (màn hình 6)
/notifications           → thông báo & log
/settings                → cài đặt chung


Bạn muốn tôi vẽ wireframe chi tiết hơn cho 1 màn hình cụ thể (ví dụ Scene Editor), hay viết PRD đầy đủ cho 1 module để bắt đầu code?
  

Chia FE BE
Mapping đầy đủ 18 chức năng từ sơ đồ → giao diện
Bảng map chi tiết
#
Chức năng (sơ đồ)
Vị trí trong UI
Component
MODULE 1: Tạo video






1.1
Sinh video từ nguồn được cung cấp
/projects/[id]/create — tab Nguồn đầu vào
<SourceInputTabs> (YouTube/Báo/Truyện/Tự nhập)
1.2
Sinh Voice
/projects/[id]/create — panel "Voice"
<VoiceConfigPanel>
1.3
Sinh Ảnh
/projects/[id]/create — panel "Nhân vật" + auto trong scene
<CharacterRefSheet> + <ImageGenStep>
1.4
Sinh sub
/projects/[id]/create — checkbox "Có sub" + editor sub
<SubtitleEditor>
MODULE 2: Quản lý video






2.1
Quản lý đoạn video sinh từ ảnh
/projects/[id]/videos
<VideoLibraryGrid>
2.2
Hỗ trợ chỉnh sửa cắt video
/videos/[vid]/edit — timeline
<VideoTrimmer>
2.3
Định dạng video
Modal "Xuất video"
<FormatExportModal>
2.4
Crop video
/videos/[vid]/edit — tool crop
<VideoCropTool>
MODULE 3: Nguồn API






3.1
API sinh kịch bản
/api-sources — tab "Kịch bản"
<ApiKeyTable type="script">
3.2
API sinh ảnh
/api-sources — tab "Ảnh"
<ApiKeyTable type="image">
3.3
API sinh video
/api-sources — tab "Video"
<ApiKeyTable type="video">
MODULE 4: Thông báo






4.1
Thông báo trên Telebot
/notifications/settings
<TelegramBotConfig>
4.2
Thông báo trên ứng dụng
Drawer + toast
<NotificationDrawer> + <Toaster>
4.3
Đẩy log
/notifications/settings — tab "Log"
<LogSinkConfig>
MODULE 5: Quản lý frame






5.1
Tạo ảnh để sinh video
/projects/[id]/frames/new
<FrameImageGenerator>
5.2
Thêm bớt ảnh
/projects/[id]/frames/[fid]
<FrameImageManager>

Wireframe các màn hình chưa vẽ chi tiết
A. Sinh Voice — panel trong trang Tạo video
┌─ VOICE ──────────────────────────────────────────────────────────┐
│  Provider: [ElevenLabs ▼]                                         │
│                                                                   │
│  Giọng:                                                           │
│  ┌─────────┬─────────┬─────────┬─────────┐                       │
│  │ ◉ Nam   │ ○ Nữ    │ ○ Trẻ   │ ○ Già   │                       │
│  │ Adam    │ Bella   │ Tina    │ Antoni  │                       │
│  │ [▶ test]│ [▶ test]│ [▶ test]│ [▶ test]│                       │
│  └─────────┴─────────┴─────────┴─────────┘                       │
│                                                                   │
│  Tốc độ:    [────●────] 1.0x                                     │
│  Cao độ:    [───●─────] 0  semitones                             │
│  Cảm xúc:   [Trung tính ▼]   (vui / buồn / nghiêm túc / hài)     │
│                                                                   │
│  ☑ Tự áp dụng cho mọi cảnh                                       │
│  ☐ Cho phép override theo từng cảnh                              │
└───────────────────────────────────────────────────────────────────┘


B. Sinh sub — editor trong Scene
┌─ Cảnh 1 · SUB ───────────────────────────────────────────────────┐
│  [Tự sinh từ Audio]  [Import .srt]  [Sửa thủ công]               │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ 00:00 → 00:03  Hôm nay tôi sẽ kể về...                   │   │
│  │ 00:03 → 00:07  Một câu chuyện ở quê nhà.                 │   │
│  │ 00:07 → 00:10  [+ thêm dòng]                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  Style: [Phông Inter ▼] [42px ▼] [Trắng ▼] [Viền đen ▼]         │
│  Vị trí: ○ Trên  ◉ Dưới  ○ Giữa                                  │
│  Preview: [▶ xem video có sub]                                   │
└───────────────────────────────────────────────────────────────────┘


C. Cắt / Crop / Định dạng video — Video Editor
┌─────────────────────────────────────────────────────────────────────┐
│  Sửa video: "Người quê.mp4"                              [💾 Lưu]   │
├─────────────────────────────────────────────────────────────────────┤
│  Tool: [✂️ Cắt] [⬚ Crop] [📐 Định dạng] [🎵 Audio] [📝 Sub]         │
│                                                                     │
│  ┌─────────────────────────────────────────────┐                   │
│  │                                             │                   │
│  │              [VIDEO PREVIEW]                │  ← canvas crop    │
│  │                                             │     (drag handles)│
│  │                                             │                   │
│  └─────────────────────────────────────────────┘                   │
│                                                                     │
│  Tỉ lệ: ◉ 9:16 (TikTok) ○ 16:9 (YT) ○ 1:1 (IG) ○ Custom            │
│  Output: ○ 720p  ◉ 1080p  ○ 4K    Codec: [H.264 ▼]                 │
│                                                                     │
│  TIMELINE                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 0:00 ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮▮ 3:24    │   │
│  │       [▮ in: 0:05]              [▮ out: 3:00]               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│           [Reset]  [Preview]  [Xuất file]                           │
└─────────────────────────────────────────────────────────────────────┘


D. Telegram bot config
┌─ THÔNG BÁO TELEGRAM ────────────────────────────────────────────┐
│  Bot Token:  [••••••••••••••••••••]  [Test connection]          │
│  Chat ID:    [-100123456789]         [Lấy từ @userinfobot]      │
│                                                                  │
│  Sự kiện gửi thông báo:                                          │
│  ☑ Video hoàn thành                                              │
│  ☑ Cảnh lỗi (>3 lần retry)                                       │
│  ☑ Hết quota API                                                 │
│  ☐ Mỗi cảnh sinh xong (spam — không nên bật)                    │
│                                                                  │
│  Template tin nhắn:                                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ ✅ {project} - {video_title} hoàn thành                    │ │
│  │ ⏱ {duration} · 🎬 {scene_count} cảnh                       │ │
│  │ 🔗 {url}                                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                  [Gửi test]     │
└──────────────────────────────────────────────────────────────────┘


E. Đẩy log
┌─ ĐẨY LOG ───────────────────────────────────────────────────────┐
│  Đích đến:                                                       │
│  ☑ File local: [./logs/app-{date}.log] [Mở thư mục]             │
│  ☑ Telegram channel: [-100987654321]                             │
│  ☐ Webhook: [https://...]                                        │
│  ☐ Sentry DSN: [https://...sentry.io]                            │
│                                                                  │
│  Mức độ log: ○ Debug  ◉ Info  ○ Warn  ○ Error                   │
│  Xoay vòng:  [Hàng ngày ▼]   Giữ:  [30 ngày ▼]                  │
│                                                                  │
│  ─────────────────────────────────────────────────               │
│  📋 LOG GẦN ĐÂY                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ 14:32 [INFO]  Video #421 completed (12 scenes)             │ │
│  │ 14:28 [ERROR] Veo timeout on scene 3, retry 1/3            │ │
│  │ 14:15 [INFO]  Project "báo" created                        │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                          [Xem tất cả →]         │
└──────────────────────────────────────────────────────────────────┘


F. Quản lý frame — chi tiết 5.1 + 5.2
┌─────────────────────────────────────────────────────────────────────┐
│  Frame: "Intro nền xanh"                              [💾] [🗑️]    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─ THÊM BỚT ẢNH ─────────────────────────────────────────────┐    │
│  │ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐                              │    │
│  │ │1 │ │2 │ │3 │ │4 │ │5 │ │+ │   [Drag để sắp xếp lại]      │    │
│  │ └──┘ └──┘ └──┘ └──┘ └──┘ └──┘                              │    │
│  │ [✕]  [✕]  [✕]  [✕]  [✕]                                    │    │
│  │                                                             │    │
│  │ [📤 Upload]  [✨ Sinh ảnh từ AI]  [📋 Paste URL]            │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ TẠO ẢNH ĐỂ SINH VIDEO ────────────────────────────────────┐    │
│  │ Provider:  [gpt-image-2 ▼]                                  │    │
│  │ Prompt:                                                     │    │
│  │ ┌─────────────────────────────────────────────────────────┐ │    │
│  │ │ Cinematic green screen background, soft lighting...     │ │    │
│  │ └─────────────────────────────────────────────────────────┘ │    │
│  │ Số lượng: [4]   Tỉ lệ: [16:9 ▼]   Style: [Photo ▼]         │    │
│  │                                                             │    │
│  │              [✨ Sinh ảnh] (~10s, ~$0.04)                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                     │
│  ┌─ SỬ DỤNG ─────────────────────────────────────────────────┐     │
│  │ [→ Dùng frame này tạo video mới]                          │     │
│  │ [→ Apply cho tất cả cảnh trong project hiện tại]          │     │
│  └────────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────┘


Information Architecture cuối cùng
App Root
│
├── /projects                          [Trang chủ, list dự án]
│   └── /[id]
│       ├── /                          [Dashboard project]
│       ├── /create                    ◀ Module 1: Tạo video
│       │   ├── Source tabs            (1.1 sinh video từ nguồn)
│       │   ├── Voice panel            (1.2 sinh voice)
│       │   ├── Character refs         (1.3 sinh ảnh)
│       │   └── Subtitle editor        (1.4 sinh sub)
│       │
│       ├── /videos                    ◀ Module 2: Quản lý video
│       │   └── /[vid]/edit            (2.1, 2.2, 2.3, 2.4)
│       │
│       └── /frames                    ◀ Module 5: Quản lý frame
│           └── /[fid]                 (5.1 tạo ảnh, 5.2 thêm bớt)
│
├── /api-sources                       ◀ Module 3 (3.1, 3.2, 3.3)
│
├── /notifications                     ◀ Module 4
│   ├── /                              (4.2 in-app drawer)
│   └── /settings                      (4.1 telegram, 4.3 log)
│
└── /settings                          [App-level config]


Khớp 1-1 với sơ đồ — verify
Sơ đồ
UI
✓
Tạo video (anh/việt)
/create + language switcher (top bar)
✅
Sinh video từ nguồn được cung cấp
SourceInputTabs (4 tab)
✅
Sinh Voice
VoiceConfigPanel
✅
Sinh Ảnh
CharacterRefSheet + auto trong pipeline
✅
Sinh sub
SubtitleEditor (per-scene)
✅
Quản lý video
/videos grid
✅
Quản lý đoạn video sinh từ ảnh
Filter "from-image" trong videos
✅
Hỗ trợ chỉnh sửa cắt video
VideoTrimmer (timeline)
✅
Định dạng video
FormatExportModal
✅
Crop video
VideoCropTool
✅
Quản lý nguồn API
/api-sources 3 tab
✅
API sinh kịch bản
tab Kịch bản
✅
API sinh ảnh
tab Ảnh
✅
API sinh video
tab Video
✅
Thông báo sang ứng dụng
NotificationDrawer
✅
Thông báo trên Telebot
TelegramBotConfig
✅
Thông báo trên ứng dụng
Toaster + Drawer
✅
Đẩy log
LogSinkConfig
✅
Quản lý frame
/frames
✅
Tạo ảnh để sinh video
FrameImageGenerator
✅
Thêm bớt ảnh
FrameImageManager
✅

Đủ 18/18 sub-feature, không sót.
Bước tiếp theo bạn muốn:
Tôi viết PRD chi tiết cho 1 module (chọn module nào?) — bao gồm user stories, API contract, edge cases.
Vẽ database schema (Postgres) khớp với 5 module này.
Định nghĩa REST API endpoints (NestJS controllers).
