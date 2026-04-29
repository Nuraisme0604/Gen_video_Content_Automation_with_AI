import os
import time
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def generate_video_veo3(prompt: str, dest_path: str, duration_seconds: int = 8) -> bool:
    """
    Generate video using Google Veo 3 via the google-genai SDK.
    Requires GOOGLE_API_KEY env var (Google AI Studio key).
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logger.error("GOOGLE_API_KEY not configured. Cannot use Veo3.")
        return False

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        logger.error("google-genai not installed. Run: pip install google-genai")
        return False

    try:
        client = genai.Client(api_key=api_key)
        model = os.getenv("VEO3_MODEL", "veo-3.0-generate-preview")

        logger.info(f"Submitting Veo3 job: model={model}, duration={duration_seconds}s")
        operation = client.models.generate_videos(
            model=model,
            prompt=prompt,
            config=types.GenerateVideosConfig(
                number_of_videos=1,
                duration_seconds=duration_seconds,
                aspect_ratio="16:9",
                enhance_prompt=True,
            ),
        )

        max_wait = int(os.getenv("VEO3_POLL_TIMEOUT", "300"))
        elapsed = 0
        poll_interval = 15

        while not operation.done:
            if elapsed >= max_wait:
                logger.error(f"Veo3 timed out after {max_wait}s for prompt: {prompt[:80]}")
                return False
            time.sleep(poll_interval)
            elapsed += poll_interval
            operation = client.operations.get(operation)
            logger.info(f"Veo3 polling... {elapsed}s elapsed")

        if not operation.response or not operation.response.generated_videos:
            logger.error("Veo3 completed but returned no videos")
            return False

        generated_video = operation.response.generated_videos[0]
        # Download the video file
        video_bytes = client.files.download(file=generated_video.video)
        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(video_bytes)

        logger.info(f"Veo3 video saved: {dest_path}")
        return True

    except Exception as e:
        logger.error(f"Veo3 generation failed: {e}", exc_info=True)
        return False
