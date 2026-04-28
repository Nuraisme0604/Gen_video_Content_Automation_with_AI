# Dog Psychology Content Engine

Đây là Repository chứa source code vận hành tự động kênh YouTube storytelling về tâm lý loài chó.

## Yêu cầu hệ thống
- Docker và Docker Compose
- FFmpeg (được tích hợp sẵn trong container của worker)
- Tài khoản các API: OpenAI, ElevenLabs, Runway.

## Cách cài đặt và chạy thử
1. Đổi tên `.env.example` thành `.env` và điền đầy đủ API Keys.
2. Build và khởi động hệ thống:
   ```bash
   docker-compose up -d --build
   ```
3. Truy cập `http://localhost:5678` để mở n8n UI.
4. Import các file JSON trong thư mục `n8n_workflows` vào n8n.
5. Setup Webhook hoặc bật nút "Test Workflow" để chạy.

## Cấu trúc luồng chạy (Tóm tắt)
- **n8n:** Điều phối kịch bản, gọi AI tạo ảnh, sinh giọng nói. Lưu trạng thái xuống PostgreSQL.
- **Python Worker:** Nhận lệnh qua HTTP Webhook, nối video (MoviePy), thêm nhạc nền (Audio Ducking), xuất thumbnail và sub-clip cho TikTok.
