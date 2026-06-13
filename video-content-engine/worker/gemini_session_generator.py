import os
import asyncio
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def _get_session_cookies():
    """Cookie phiên Gemini: ưu tiên lấy từ DB qua backend (login helper app lưu vào
    đây), fallback env GEMINI_1PSID/GEMINI_1PSIDTS cho dev local."""
    backend = os.getenv("BACKEND_URL", "http://backend:3001").rstrip("/")
    secret = os.getenv("INTERNAL_API_SECRET", "dev-internal-secret")
    try:
        import json
        import requests
        r = requests.get(
            f"{backend}/api/v1/api-keys/internal/active",
            params={"capability": "VIDEO", "provider": "gemini_session"},
            headers={"x-internal-secret": secret},
            timeout=10,
        )
        if r.status_code == 200:
            data = json.loads(r.json()["key"])
            if data.get("psid") and data.get("psidts"):
                return data["psid"], data["psidts"]
    except Exception as e:
        logger.warning(f"gemini_session: không lấy được cookie từ backend ({e}); thử env")
    return os.getenv("GEMINI_1PSID"), os.getenv("GEMINI_1PSIDTS")


def generate_video_gemini_session(
    prompt: str,
    dest_path: str,
    image_path: Optional[str] = None,
) -> bool:
    """
    Generate video by driving a logged-in Gemini web session (Google AI Pro/Ultra)
    via the reverse-engineered gemini-webapi library — uses the account's
    subscription quota instead of a paid API key.

    Runs PARALLEL to the paid Veo3 path (VIDEO_PROVIDER=veo3); it does not replace
    it. Selected via VIDEO_PROVIDER=gemini_session.

    Cookie phiên (__Secure-1PSID, __Secure-1PSIDTS) lấy từ DB qua backend (login
    helper app lưu vào đó), fallback env GEMINI_1PSID/GEMINI_1PSIDTS cho dev local.

    Note: text-to-video only for now. image_path is accepted for signature parity
    with generate_video_veo3 but not yet used (Gemini web image-to-video not wired).
    """
    psid, psidts = _get_session_cookies()
    if not psid or not psidts:
        logger.error("gemini_session: chưa có cookie (chạy login helper app, hoặc set GEMINI_1PSID/GEMINI_1PSIDTS).")
        return False

    try:
        from gemini_webapi import GeminiClient
    except ImportError:
        logger.error("gemini-webapi not installed. Run: pip install gemini-webapi")
        return False

    async def _run() -> bool:
        client = GeminiClient(psid, psidts)
        await client.init(timeout=30, auto_close=False)
        try:
            response = await client.generate_content(prompt)
            videos = getattr(response, "videos", None)
            if not videos:
                logger.error("gemini_session: account không trả về video — tài khoản Gemini này chưa có quyền Veo qua web session. Dùng VIDEO_PROVIDER=local (slideshow) hoặc veo3 (API có billing).")
                return False
            dest = Path(dest_path)
            dest.parent.mkdir(parents=True, exist_ok=True)
            # save() polls until the video finishes rendering, then writes the file
            await videos[0].save(path=str(dest.parent), filename=dest.name, verbose=False)
            if dest.exists():
                logger.info(f"gemini_session video saved: {dest_path}")
                return True
            logger.error("gemini_session: save() returned but file not found at dest_path")
            return False
        finally:
            await client.close()

    try:
        return asyncio.run(_run())
    except Exception as e:
        logger.error(f"gemini_session generation failed: {e}", exc_info=True)
        return False
