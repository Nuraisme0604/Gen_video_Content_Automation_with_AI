import os
import time
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_PERMANENT_SIGNALS = ("401", "403", "permission", "policy", "safety", "billing", "unauthorized", "access denied", "not authorized")
_TRANSIENT_SIGNALS = ("429", "503", "rate limit", "quota", "service unavailable", "connection", "timeout", "network")


class Veo3PermanentError(Exception):
    """Raised for permanent Veo3 failures (auth/policy) — do not retry."""


class Veo3TransientError(Exception):
    """Raised for transient Veo3 API failures (429/503/network) — safe to retry."""


def generate_video_veo3(
    prompt: str,
    dest_path: str,
    duration_seconds: int = 8,
    image_path: Optional[str] = None,
) -> bool:
    """
    Generate video using Google Veo 3.1 via the google-genai SDK.

    Args:
        prompt: Text description of the video.
        dest_path: Output mp4 path.
        duration_seconds: Clip length (Veo 3.1 supports 4/6/8s).
        image_path: Optional path to a reference image (jpg/png). If provided,
                    Veo uses it as the initial frame → image-to-video mode for
                    visual continuity with the DALL-E scene image.

    Veo 3.1 generates NATIVE AUDIO (ambient + SFX + dialogue if prompt mentions speech).
    Audio gets mixed in video_assembler.py at VEO_AUDIO_VOLUME (default 30%) under voiceover.
    """
    api_key = os.getenv("GOOGLE_API_KEY")
    if not api_key:
        logger.error("GOOGLE_API_KEY not configured. Cannot use Veo3.")
        return False

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        logger.error("google-genai not installed. Run: pip install 'google-genai>=1.0.0'")
        return False

    try:
        client = genai.Client(api_key=api_key)
        model = os.getenv("VEO3_MODEL", "veo-3.1-generate-preview")

        # Build config — supports image-to-video + audio control
        config_kwargs = {
            "number_of_videos": 1,
            "duration_seconds": duration_seconds,
            "aspect_ratio": "16:9",
            "enhance_prompt": True,
        }

        # Build call kwargs
        call_kwargs = {"model": model, "prompt": prompt}

        # Image-to-video: pass DALL-E scene image as initial frame for visual continuity.
        # The SDK API surface for this is unstable across versions:
        #   - google-genai >= 1.10 (rough): accepts image= kwarg directly
        #   - google-genai 1.4: NO image support → fall back to text-only
        # We probe via try/except + retry without image on TypeError.
        image_attached = False
        if image_path and os.path.exists(image_path):
            try:
                from google.genai.types import Image as GenAIImage
                with open(image_path, "rb") as f:
                    img_bytes = f.read()
                mime = "image/png" if image_path.lower().endswith(".png") else "image/jpeg"
                call_kwargs["image"] = GenAIImage(image_bytes=img_bytes, mime_type=mime)
                image_attached = True
                logger.info(f"Veo3: trying image-to-video mode using {image_path} ({len(img_bytes)} bytes)")
            except Exception as e:
                logger.warning(f"Veo3: failed to build image object (falling back to text-only): {e}")

        config = types.GenerateVideosConfig(**config_kwargs)
        call_kwargs["config"] = config

        logger.info(f"Submitting Veo3 job: model={model}, duration={duration_seconds}s, image={'yes' if image_attached else 'no'}")

        try:
            operation = client.models.generate_videos(**call_kwargs)
        except TypeError as e:
            # SDK doesn't accept 'image' kwarg → retry without it (text-to-video mode)
            if image_attached and "image" in str(e):
                logger.warning(
                    f"Veo3: installed SDK version doesn't support image-to-video kwarg. "
                    f"Bump 'google-genai>=1.10' in requirements.txt for image continuity. "
                    f"Falling back to text-to-video for this scene."
                )
                call_kwargs.pop("image", None)
                operation = client.models.generate_videos(**call_kwargs)
            else:
                raise

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
        err_str = str(e).lower()
        if any(sig in err_str for sig in _PERMANENT_SIGNALS):
            raise Veo3PermanentError(str(e)) from e
        if any(sig in err_str for sig in _TRANSIENT_SIGNALS):
            raise Veo3TransientError(str(e)) from e
        logger.error(f"Veo3 generation failed: {e}", exc_info=True)
        return False
