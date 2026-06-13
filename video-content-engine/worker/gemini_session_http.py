"""
Gemini session proxy — drive a logged-in Gemini web session (Google AI Pro/Ultra)
via gemini-webapi to generate SCRIPT text and IMAGES, using the account's
subscription quota instead of a paid API key.

Parallel to gemini_session_generator.py (which handles VIDEO). Cookie phiên lấy
từ DB qua backend (login helper app lưu vào đó), fallback env. Exposed over HTTP
by main_server.py so the n8n workflow can call it like any other provider.
"""

import base64
import logging
import tempfile
from pathlib import Path
from typing import Tuple

from gemini_session_generator import _get_session_cookies

logger = logging.getLogger(__name__)


async def _open_client():
    from gemini_webapi import GeminiClient

    psid, psidts = _get_session_cookies()
    if not psid or not psidts:
        raise RuntimeError("gemini_session: chưa có cookie (chạy gemini_login.py).")
    client = GeminiClient(psid, psidts)
    await client.init(timeout=30, auto_close=False)
    return client


async def session_chat(prompt: str) -> str:
    """Generate text (used for script breakdown). Returns raw model text."""
    client = await _open_client()
    try:
        response = await client.generate_content(prompt)
        return response.text or ""
    finally:
        await client.close()


async def session_image(prompt: str) -> Tuple[str, str]:
    """Generate an image. Returns (mime_type, base64_data)."""
    client = await _open_client()
    try:
        response = await client.generate_content(prompt)
        if not response.images:
            raise RuntimeError("gemini_session: response had no images (account may lack image access)")
        with tempfile.TemporaryDirectory() as d:
            saved = await response.images[0].save(path=d, filename="img", verbose=False)
            path = Path(saved) if saved else None
            if not path or not path.exists():
                files = list(Path(d).iterdir())
                path = files[0] if files else None
            if not path or not path.exists():
                raise RuntimeError("gemini_session: image save() returned no file")
            data = path.read_bytes()
        mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        return mime, base64.b64encode(data).decode()
    finally:
        await client.close()
