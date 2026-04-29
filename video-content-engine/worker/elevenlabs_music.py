"""
ElevenLabs Music API client — replaces unofficial Suno reverse-engineered endpoint.
Uses the same ELEVENLABS_API_KEY as the voiceover module.

Docs: https://elevenlabs.io/docs/api-reference/music/compose
Endpoint: POST https://api.elevenlabs.io/v1/music
Note: Eleven Music API requires a paid ElevenLabs plan.
"""
import os
import logging
from pathlib import Path
import requests

logger = logging.getLogger(__name__)

ELEVEN_API_BASE = "https://api.elevenlabs.io"


def generate_bgm(prompt: str, dest_path: str, duration_ms: int = 120000) -> bool:
    """
    Generate instrumental background music via ElevenLabs Music API.

    Args:
        prompt: Text describing the music vibe (e.g. "melancholic cinematic, instrumental")
        dest_path: Output mp3 path
        duration_ms: Duration in milliseconds. API range 3000-600000 (3s - 10min).
                     Caller (main_server) thường tính theo video_duration_sec để match.

    Returns False on any error → caller falls back to static BGM URL.
    Note: ElevenLabs Music max là 600s (10 min). Video dài hơn 10 phút sẽ được
    loop với crossfade trong video_assembler.
    """
    api_key = os.getenv("ELEVENLABS_API_KEY")
    if not api_key:
        logger.warning("ELEVENLABS_API_KEY not configured. Skipping ElevenLabs Music generation.")
        return False

    duration_ms = max(3000, min(600000, int(duration_ms)))

    try:
        resp = requests.post(
            f"{ELEVEN_API_BASE}/v1/music",
            headers={
                "xi-api-key": api_key,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg",
            },
            json={
                "prompt": prompt,
                "music_length_ms": duration_ms,
                "force_instrumental": True,
                "model_id": os.getenv("ELEVENLABS_MUSIC_MODEL", "music_v1"),
            },
            timeout=180,
        )
        resp.raise_for_status()

        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(resp.content)
        logger.info(f"ElevenLabs Music generated: {dest_path} ({len(resp.content)} bytes)")
        return True

    except requests.exceptions.HTTPError as e:
        body = e.response.text[:300] if e.response is not None else ""
        logger.error(f"ElevenLabs Music HTTP {e.response.status_code if e.response else '?'}: {body}")
        return False
    except Exception as e:
        logger.error(f"ElevenLabs Music generation failed: {e}", exc_info=True)
        return False
