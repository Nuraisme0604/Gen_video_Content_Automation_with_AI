import os
import requests
import logging

logger = logging.getLogger(__name__)

def send_telegram_notification(message: str, image_path: str = None):
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not bot_token or not chat_id:
        logger.warning("Telegram credentials not configured. Skipping notification.")
        return False
        
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML"
    }
    
    try:
        if image_path and os.path.exists(image_path):
            photo_url = f"https://api.telegram.org/bot{bot_token}/sendPhoto"
            with open(image_path, "rb") as f:
                resp = requests.post(photo_url, data=payload, files={"photo": f})
        else:
            resp = requests.post(url, json=payload)
        resp.raise_for_status()
        logger.info("Telegram notification sent successfully.")
        return True
    except Exception as e:
        logger.error(f"Failed to send Telegram message: {e}")
        return False

def upload_to_youtube(video_path: str, title: str, description: str, tags: list, privacy_status: str = "private") -> str:
    """
    Mock upload to YouTube.
    Real YouTube upload requires OAuth2 Client Library and user authorization flow.
    """
    logger.info(f"🚀 [YOUTUBE UPLOAD MOCK] Bắt đầu upload video: {title}")
    logger.info(f"   - File: {video_path}")
    logger.info(f"   - Trạng thái: {privacy_status}")
    logger.info(f"   - Tags: {', '.join(tags)}")
    
    # Ở đây sếp có thể chèn script Google API Python Client
    video_url = "https://youtube.com/watch?v=draft_uploaded_123"
    logger.info(f"✅ Upload thành công: {video_url}")
    return video_url
