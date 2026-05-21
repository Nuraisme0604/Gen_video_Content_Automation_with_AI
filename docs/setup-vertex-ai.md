# Vertex AI Setup — Veo3 thật cho production

## Vì sao cần?

Free Gemini API key (AI Studio) **không có quota** cho:
- Imagen 4 image generation → trả 400 "paid plan only"
- Veo 3 video generation → trả 429 "quota exhausted"

Cách duy nhất để gen video AI thật: dùng **Vertex AI** với billing enabled.

---

## Bước 1 — Enable billing trên Google Cloud

1. Vào https://console.cloud.google.com/
2. Tạo project mới hoặc chọn project có sẵn → ghi nhớ **PROJECT_ID**
3. Menu trái → **Billing** → **Link a billing account** → nhập credit card
4. Menu trái → **APIs & Services** → **Enable APIs**:
   - **Vertex AI API**
   - **Cloud Storage API** (cho output files)

## Bước 2 — Tạo Service Account JSON key

1. **IAM & Admin** → **Service Accounts** → **Create Service Account**
2. Name: `vca-veo3-runner`
3. Role: **Vertex AI User** + **Storage Object Admin**
4. Done → click vào service account vừa tạo → **Keys** tab → **Add Key** → **JSON**
5. File `xxx.json` được tải về máy bạn

## Bước 3 — Đưa key vào tool

```bash
# Copy file key vào project
cp ~/Downloads/your-service-account.json \
   /home/remnux/Gen_video_Content_Automation_with_AI/video-content-engine/worker/gcp-key.json

# Update .env
echo "GOOGLE_APPLICATION_CREDENTIALS=/app/gcp-key.json" >> .env
echo "GCP_PROJECT_ID=your-project-id-here" >> .env
echo "GCP_LOCATION=us-central1" >> .env
echo "VIDEO_PROVIDER=veo3" >> .env
```

## Bước 4 — Update docker-compose.yml để mount key

Mở `docker-compose.yml`, trong service `python_worker`:

```yaml
python_worker:
  ...
  environment:
    - GOOGLE_APPLICATION_CREDENTIALS=/app/gcp-key.json
    - GCP_PROJECT_ID=${GCP_PROJECT_ID}
    - GCP_LOCATION=${GCP_LOCATION:-us-central1}
  volumes:
    - ./video-content-engine/worker/gcp-key.json:/app/gcp-key.json:ro
```

## Bước 5 — Restart

```bash
docker compose up -d --force-recreate python_worker
```

## Chi phí dự kiến

| Service | Giá | 1 video 5 phút (~75 cảnh × 8s) |
|---|---|---|
| Veo 3 Fast | ~$0.10/giây | ~$60 |
| Veo 3 Standard | ~$0.50/giây | ~$300 |
| Imagen 4 | $0.04/ảnh | ~$3 (75 ảnh) |
| Gemini text | gần free | <$0.10 |
| **Total** | | **~$63 - $300 / video** |

→ **Tip:** Set `BUDGET_LIMIT_PER_VIDEO=10` trong `.env` để guard, hoặc dùng Veo 2 (rẻ hơn) cho test.

---

## Alternative: chỉ enable billing trên Gemini API key

Đơn giản hơn, không cần service account:

1. Vào https://aistudio.google.com/app/apikey
2. Click vào key đang dùng → **Upgrade to paid plan**
3. Liên kết credit card

Sau đó key cũ `AIzaSy...` sẽ có quota Imagen + Veo3 thật. Không cần đổi code, chỉ cần restart n8n.
