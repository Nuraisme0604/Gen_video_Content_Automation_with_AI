import os
import time
import requests
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

SUNO_API_BASE = "https://studio-api.suno.ai"


def generate_bgm(prompt: str, dest_path: str) -> bool:
    """
    Generate background music using Suno AI.
    Requires SUNO_API_KEY env var.
    Falls back silently if key is not configured.
    """
    api_key = os.getenv("SUNO_API_KEY")
    if not api_key:
        logger.warning("SUNO_API_KEY not configured. Skipping Suno BGM generation.")
        return False

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        resp = requests.post(
            f"{SUNO_API_BASE}/api/generate",
            headers=headers,
            json={
                "prompt": prompt,
                "make_instrumental": True,
                "mv": os.getenv("SUNO_MODEL", "chirp-v3-5"),
            },
            timeout=30,
        )
        resp.raise_for_status()
        clips = resp.json()

        if not clips:
            logger.error("Suno returned empty clip list")
            return False

        clip_id = clips[0].get("id")
        if not clip_id:
            logger.error(f"Suno response missing clip id: {clips}")
            return False

        logger.info(f"Suno job submitted: clip_id={clip_id}")

        for attempt in range(40):
            time.sleep(10)
            poll = requests.get(
                f"{SUNO_API_BASE}/api/get",
                headers=headers,
                params={"ids": clip_id},
                timeout=15,
            )
            poll.raise_for_status()
            data = poll.json()

            if not data:
                continue

            clip_data = data[0] if isinstance(data, list) else data
            status = clip_data.get("status", "")

            if status == "complete":
                audio_url = clip_data.get("audio_url")
                if not audio_url:
                    logger.error("Suno clip complete but no audio_url")
                    return False

                dl = requests.get(audio_url, timeout=60)
                dl.raise_for_status()
                Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
                with open(dest_path, "wb") as f:
                    f.write(dl.content)
                logger.info(f"Suno BGM saved: {dest_path}")
                return True

            elif status == "error":
                logger.error(f"Suno clip failed: {clip_data}")
                return False

            logger.info(f"Suno polling attempt {attempt + 1}/40, status={status}")

        logger.error(f"Suno clip {clip_id} timed out after 400s")
        return False

    except Exception as e:
        logger.error(f"Suno BGM generation failed: {e}", exc_info=True)
        return False
