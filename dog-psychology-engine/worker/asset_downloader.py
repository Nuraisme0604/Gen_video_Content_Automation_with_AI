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
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": api_key,
    }
    data = {
        "text": text,
        "model_id": os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2"),
        "voice_settings": {
            "stability": 0.45,
            "similarity_boost": 0.85,
            "style": 0.35,
            "use_speaker_boost": True,
        },
    }
    try:
        response = session.post(url, json=data, headers=headers, timeout=60)
        response.raise_for_status()
        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(response.content)
        return True
    except Exception as e:
        logger.error(f"ElevenLabs voiceover failed: {e}")
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


def _generate_video_from_prompt(prompt: str, dest_path: str) -> bool:
    """Route video generation to Veo3 or Runway based on VIDEO_PROVIDER env var."""
    provider = os.getenv("VIDEO_PROVIDER", "runway").lower()

    if provider == "veo3":
        from veo3_generator import generate_video_veo3
        duration = int(os.getenv("SCENE_VIDEO_SECONDS", "8"))
        return generate_video_veo3(prompt, dest_path, duration_seconds=duration)

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

    # 1. Download image (pre-generated URL from n8n/DALL-E)
    image_url = scene.get("image")
    if image_url and image_url.startswith("http"):
        img_path = str(scene_dir / f"scene_{scene_id}_image.jpg")
        if download_file(image_url, img_path):
            results["image_path"] = img_path

    # 2. Voiceover via ElevenLabs
    text = scene.get("narration_excerpt", "")
    if text and elevenlabs_api_key and voice_id:
        audio_path = str(scene_dir / f"scene_{scene_id}_voice.mp3")
        if generate_voiceover(text, audio_path, voice_id, elevenlabs_api_key):
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
        if _generate_video_from_prompt(video_prompt, vid_path):
            results["video_path"] = vid_path
    else:
        logger.warning(f"Scene {scene_id}: no video_url, task_id, or video_prompt — skipping video")

    return results
