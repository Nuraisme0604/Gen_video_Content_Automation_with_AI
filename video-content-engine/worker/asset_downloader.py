import os
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

session = requests.Session()
retry = Retry(connect=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
adapter = HTTPAdapter(max_retries=retry)
session.mount("http://", adapter)
session.mount("https://", adapter)


def download_file(url: str, dest_path: str) -> bool:
    try:
        response = session.get(url, stream=True, timeout=60)
        response.raise_for_status()
        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        logger.error(f"Failed to download {url}: {e}")
        return False


def generate_voiceover(text: str, dest_path: str, voice_id: str, api_key: str) -> bool:
    """Use Edge TTS (free, no API key) for voice synthesis."""
    Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
    # Default Vietnamese male voice; override via VOICE_NAME env var
    voice = os.getenv("VOICE_NAME", "vi-VN-NamMinhNeural")
    try:
        import edge_tts, asyncio
        async def _run():
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(dest_path)
        asyncio.run(_run())
        return Path(dest_path).exists() and Path(dest_path).stat().st_size > 0
    except Exception as e:
        logger.error(f"Edge TTS voiceover failed: {e}")
        return False


def poll_runway_task(task_id: str, api_key: str, max_retries: int = 30, delay: int = 15) -> str | None:
    url = f"https://api.dev.runwayml.com/v1/tasks/{task_id}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "X-Runway-Version": "2024-11-06",
    }
    for attempt in range(max_retries):
        try:
            response = session.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            status = data.get("status")
            if status == "SUCCEEDED":
                outputs = data.get("output", [])
                return outputs[0] if outputs else None
            elif status == "FAILED":
                logger.error(f"Runway task {task_id} failed: {data}")
                return None
            logger.info(f"Runway task {task_id}: {status}, attempt {attempt + 1}/{max_retries}")
        except Exception as e:
            logger.warning(f"Error polling Runway task {task_id}: {e}")
        time.sleep(delay)
    logger.error(f"Runway task {task_id} timed out")
    return None


def _generate_video_from_prompt(prompt: str, dest_path: str, image_path: str = None) -> bool:
    """
    Route video generation to Veo3 or Runway based on VIDEO_PROVIDER env var.

    Args:
        prompt: Text description of the video.
        dest_path: Output mp4 path.
        image_path: Optional reference image (DALL-E scene image). For Veo3,
                    enables image-to-video mode → visual continuity. For Runway,
                    currently ignored (Runway image-to-video uses different param).
    """
    provider = os.getenv("VIDEO_PROVIDER", "slideshow").lower()
    use_image = os.getenv("USE_IMAGE_TO_VIDEO", "true").lower() in ("true", "1", "yes")

    if provider == "slideshow":
        # Free fallback: convert image to MP4 via ffmpeg (Ken Burns zoom effect)
        if not image_path or not Path(image_path).exists():
            logger.warning(f"Slideshow needs image_path, none provided")
            return False
        duration = int(os.getenv("SCENE_VIDEO_SECONDS", "8"))
        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        import subprocess
        try:
            cmd = [
                "ffmpeg", "-y", "-loop", "1", "-i", image_path,
                "-c:v", "libx264", "-preset", "medium", "-crf", "20",
                "-t", str(duration), "-pix_fmt", "yuv420p",
                "-vf", f"scale=1920:1080:flags=lanczos:force_original_aspect_ratio=increase,crop=1920:1080,zoompan=z='min(zoom+0.0015,1.5)':d={duration*30}:s=1920x1080:fps=30",
                "-r", "30", dest_path
            ]
            r = subprocess.run(cmd, capture_output=True, timeout=120)
            if r.returncode == 0 and Path(dest_path).exists():
                logger.info(f"Slideshow video created: {dest_path}")
                return True
            logger.error(f"ffmpeg failed: {r.stderr.decode()[:300]}")
            return False
        except Exception as e:
            logger.error(f"Slideshow gen failed: {e}")
            return False

    if provider == "veo3":
        from veo3_generator import generate_video_veo3
        duration = int(os.getenv("SCENE_VIDEO_SECONDS", "8"))
        return generate_video_veo3(
            prompt,
            dest_path,
            duration_seconds=duration,
            image_path=image_path if use_image else None,
        )

    elif provider == "runway":
        # Submit Runway job then poll
        api_key = os.getenv("VIDEO_API_KEY", "")
        api_url = os.getenv("VIDEO_API_URL", "https://api.dev.runwayml.com/v1/text_to_video")
        model = os.getenv("VIDEO_MODEL", "gen4_turbo")
        duration = int(os.getenv("SCENE_VIDEO_SECONDS", "8"))
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "X-Runway-Version": "2024-11-06",
        }
        try:
            resp = session.post(
                api_url,
                headers=headers,
                json={"model": model, "prompt_text": prompt, "duration": duration, "ratio": "16:9"},
                timeout=30,
            )
            resp.raise_for_status()
            task_id = resp.json().get("id")
            if not task_id:
                logger.error("Runway submit returned no task id")
                return False
            video_url = poll_runway_task(task_id, api_key)
            if video_url:
                return download_file(video_url, dest_path)
        except Exception as e:
            logger.error(f"Runway video generation failed: {e}")
        return False

    else:
        logger.error(f"Unknown VIDEO_PROVIDER: {provider}")
        return False


def download_assets_for_scene(scene: dict, assets_dir: str, runway_api_key: str,
                               elevenlabs_api_key: str, voice_id: str) -> dict:
    """Download/generate all assets for a single scene."""
    scene_id = str(scene.get("scene_id", "1"))
    scene_dir = Path(assets_dir)
    scene_dir.mkdir(parents=True, exist_ok=True)

    results = {"scene_id": scene_id, "video_path": None, "audio_path": None, "image_path": None}

    # 1. Save image — accepts http(s) URL or data:image/...;base64,... (Gemini image gen)
    image_url = scene.get("image_url") or scene.get("image")
    if image_url:
        img_path = str(scene_dir / f"scene_{scene_id}_image.jpg")
        if image_url.startswith("data:"):
            import base64
            try:
                b64 = image_url.split(",", 1)[1]
                Path(img_path).write_bytes(base64.b64decode(b64))
                results["image_path"] = img_path
            except Exception as e:
                logger.error(f"Failed to decode data URL for scene {scene_id}: {e}")
        elif image_url.startswith("http"):
            if download_file(image_url, img_path):
                results["image_path"] = img_path

    # 2. Voiceover via Edge TTS (free, no API key required) or ElevenLabs
    text = scene.get("narration_excerpt", "")
    if text:
        audio_path = str(scene_dir / f"scene_{scene_id}_voice.mp3")
        if generate_voiceover(text, audio_path, voice_id or "", elevenlabs_api_key or ""):
            results["audio_path"] = audio_path

    # 3. Video generation — three strategies in order of priority:
    #    a) video_url already provided (pre-rendered, skip generation)
    #    b) task_id provided (Runway task already submitted by n8n, just poll)
    #    c) video_prompt provided (generate fresh via VIDEO_PROVIDER)
    video_url = scene.get("video_url")
    task_id = scene.get("task_id")
    video_prompt = scene.get("video_prompt", "")
    vid_path = str(scene_dir / f"scene_{scene_id}_video.mp4")

    if video_url:
        if download_file(video_url, vid_path):
            results["video_path"] = vid_path
    elif task_id and runway_api_key:
        url = poll_runway_task(task_id, runway_api_key)
        if url and download_file(url, vid_path):
            results["video_path"] = vid_path
    elif video_prompt:
        # Pass DALL-E scene image (if downloaded) as initial frame → image-to-video
        # giúp visual của Veo3 video khớp với scene image (consistency between scenes)
        if _generate_video_from_prompt(video_prompt, vid_path, image_path=results.get("image_path")):
            results["video_path"] = vid_path
    else:
        logger.warning(f"Scene {scene_id}: no video_url, task_id, or video_prompt — skipping video")

    return results
