import os
import requests
import logging

logger = logging.getLogger(__name__)


def send_telegram_notification(message: str, image_path: str = None) -> bool:
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not bot_token or not chat_id:
        logger.warning("Telegram credentials not configured. Skipping notification.")
        return False

    base_url = f"https://api.telegram.org/bot{bot_token}"
    try:
        if image_path and os.path.exists(image_path):
            photo_payload = {"chat_id": chat_id, "caption": message, "parse_mode": "HTML"}
            with open(image_path, "rb") as f:
                resp = requests.post(f"{base_url}/sendPhoto", data=photo_payload, files={"photo": f}, timeout=30)
        else:
            resp = requests.post(
                f"{base_url}/sendMessage",
                json={"chat_id": chat_id, "text": message, "parse_mode": "HTML"},
                timeout=15,
            )
        resp.raise_for_status()
        logger.info("Telegram notification sent.")
        return True
    except Exception as e:
        logger.error(f"Telegram notification failed: {e}")
        return False


def upload_to_youtube(video_path: str, title: str, description: str,
                      tags: list, privacy_status: str = None) -> str:
    """
    Upload video to YouTube via OAuth2 refresh token.

    Setup:
    1. Create OAuth2 credentials at console.cloud.google.com
    2. Get refresh token via OAuth2 Playground: https://developers.google.com/oauthplayground
       (scope: https://www.googleapis.com/auth/youtube.upload)
    3. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN in .env
    """
    client_id = os.getenv("YOUTUBE_CLIENT_ID")
    client_secret = os.getenv("YOUTUBE_CLIENT_SECRET")
    refresh_token = os.getenv("YOUTUBE_REFRESH_TOKEN")
    privacy = privacy_status or os.getenv("YOUTUBE_PRIVACY_STATUS", "private")
    category_id = os.getenv("YOUTUBE_CATEGORY_ID", "22")

    if not all([client_id, client_secret, refresh_token]):
        logger.warning("YouTube credentials incomplete. Skipping upload.")
        return ""

    if not os.path.exists(video_path):
        logger.error(f"Video file not found: {video_path}")
        return ""

    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError:
        logger.error("Google API client not installed. Run: pip install google-api-python-client google-auth")
        return ""

    try:
        credentials = Credentials(
            token=None,
            refresh_token=refresh_token,
            client_id=client_id,
            client_secret=client_secret,
            token_uri="https://oauth2.googleapis.com/token",
        )
        credentials.refresh(Request())

        youtube = build("youtube", "v3", credentials=credentials, cache_discovery=False)

        request_body = {
            "snippet": {
                "title": title[:100],
                "description": description[:5000],
                "tags": tags[:500],
                "categoryId": category_id,
            },
            "status": {"privacyStatus": privacy},
        }

        media = MediaFileUpload(video_path, chunksize=10 * 1024 * 1024, resumable=True, mimetype="video/mp4")
        insert_request = youtube.videos().insert(
            part="snippet,status", body=request_body, media_body=media
        )

        response = None
        while response is None:
            status, response = insert_request.next_chunk()
            if status:
                logger.info(f"YouTube upload: {int(status.progress() * 100)}%")

        video_id = response["id"]
        url = f"https://youtube.com/watch?v={video_id}"
        logger.info(f"YouTube upload complete: {url}")
        return url

    except Exception as e:
        logger.error(f"YouTube upload failed: {e}", exc_info=True)
        return ""
