import os
import time
import requests
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

def download_file(url: str, dest_path: str):
    """Download a file from URL to dest_path."""
    try:
        response = requests.get(url, stream=True, timeout=60)
        response.raise_for_status()
        with open(dest_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except Exception as e:
        logger.error(f"Failed to download {url}: {str(e)}")
        return False

def generate_voiceover(text: str, dest_path: str, voice_id: str, api_key: str):
    """Call ElevenLabs API to generate voiceover and save to dest_path."""
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "Accept": "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": api_key
    }
    data = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.45,
            "similarity_boost": 0.85,
            "style": 0.35,
            "use_speaker_boost": True
        }
    }
    try:
        response = requests.post(url, json=data, headers=headers, timeout=60)
        response.raise_for_status()
        with open(dest_path, 'wb') as f:
            f.write(response.content)
        return True
    except Exception as e:
        logger.error(f"Failed to generate voiceover: {str(e)}")
        return False

def poll_runway_task(task_id: str, api_key: str, max_retries: int = 30, delay: int = 15) -> str:
    """Poll Runway API until task succeeds, returning the video URL."""
    url = f"https://api.dev.runwayml.com/v1/tasks/{task_id}"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "X-Runway-Version": "2024-11-06"
    }
    
    for attempt in range(max_retries):
        try:
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            status = data.get("status")
            
            if status == "SUCCEEDED":
                return data.get("output", [])[0]
            elif status == "FAILED":
                logger.error(f"Runway task {task_id} failed: {data}")
                return None
                
            logger.info(f"Task {task_id} status: {status}. Waiting {delay}s...")
        except Exception as e:
            logger.warning(f"Error polling task {task_id}: {str(e)}")
            
        time.sleep(delay)
        
    logger.error(f"Task {task_id} timed out after {max_retries} retries.")
    return None

def download_assets_for_scene(scene: dict, assets_dir: str, runway_api_key: str, elevenlabs_api_key: str, voice_id: str) -> dict:
    """Download all assets for a single scene."""
    scene_id = scene.get("scene_id", "1")
    scene_dir = Path(assets_dir)
    scene_dir.mkdir(parents=True, exist_ok=True)
    
    results = {
        "scene_id": scene_id,
        "video_path": None,
        "audio_path": None,
        "image_path": None
    }
    
    # 1. Download Image (from OpenAI URL)
    image_url = scene.get("image")
    if image_url and image_url.startswith("http"):
        img_path = scene_dir / f"scene_{scene_id}_image.jpg"
        if download_file(image_url, str(img_path)):
            results["image_path"] = str(img_path)
            
    # 2. Generate/Download Voiceover
    text = scene.get("narration_excerpt", "")
    if text and elevenlabs_api_key and voice_id:
        audio_path = scene_dir / f"scene_{scene_id}_voice.mp3"
        if generate_voiceover(text, str(audio_path), voice_id, elevenlabs_api_key):
            results["audio_path"] = str(audio_path)
            
    # 3. Poll and Download Video (Runway)
    task_id = scene.get("task_id")
    video_url = scene.get("video_url") # If it's already provided (e.g. mock test)
    
    if task_id and not video_url and runway_api_key:
        logger.info(f"Polling Runway task {task_id} for scene {scene_id}...")
        video_url = poll_runway_task(task_id, runway_api_key)
        
    if video_url:
        vid_path = scene_dir / f"scene_{scene_id}_video.mp4"
        if download_file(video_url, str(vid_path)):
            results["video_path"] = str(vid_path)
            
    return results
