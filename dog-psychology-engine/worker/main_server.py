import os
import logging
from typing import List, Optional, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from asset_downloader import download_assets_for_scene

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/content_engine")
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

MAX_PARALLEL_SCENES = int(os.getenv("MAX_PARALLEL_SCENES", "5"))
COST_PER_SCENE = 0.65  # image $0.1 + voice $0.05 + video $0.5

app = FastAPI(title="Content Engine Worker", version="3.0.0")


class RenderScene(BaseModel):
    scene_id: str
    start_sec: int
    end_sec: int
    narration_excerpt: str
    image: Optional[str] = None        # Pre-generated image URL (DALL-E from n8n)
    video_url: Optional[str] = None    # Pre-rendered video URL (skip generation)
    task_id: Optional[str] = None      # Runway task ID (if pre-submitted by n8n)
    video_prompt: Optional[str] = None # Prompt for worker to generate video (Veo3/Runway)
    sound_design: Optional[str] = None


class RenderManifest(BaseModel):
    episode_id: str
    workspace: str
    title: str
    narration_script: str
    thumbnail_text: str
    seo_keywords: List[str]
    scenes: List[RenderScene]
    seo: Optional[Dict[str, Any]] = None
    highlights: Optional[List[Dict[str, Any]]] = None  # For TikTok/Shorts clips


def _download_single_scene(args: tuple) -> tuple:
    """Worker function for ThreadPoolExecutor."""
    scene_order, scene, assets_dir, runway_key, elevenlabs_key, voice_id = args
    results = download_assets_for_scene(
        scene.model_dump(), assets_dir, runway_key, elevenlabs_key, voice_id
    )
    return scene_order, scene, results


def _ensure_bgm(bgm_path: str):
    """Generate or download background music. Tries Suno first, falls back to static URL."""
    if os.path.exists(bgm_path):
        return

    os.makedirs(os.path.dirname(bgm_path), exist_ok=True)
    music_provider = os.getenv("MUSIC_PROVIDER", "suno").lower()

    if music_provider == "suno":
        from suno_client import generate_bgm
        prompt = os.getenv("BGM_PROMPT", "calm ambient background music, emotional, no vocals")
        logger.info("Generating BGM via Suno AI...")
        if generate_bgm(prompt, bgm_path):
            return

    # Fallback: download static sample
    logger.info("Falling back to static BGM download...")
    try:
        import requests
        r = requests.get(
            "https://github.com/rafaelreis-hotmart/Audio-Sample-files/raw/master/sample.mp3",
            timeout=15,
        )
        r.raise_for_status()
        with open(bgm_path, "wb") as f:
            f.write(r.content)
        logger.info(f"Static BGM downloaded to {bgm_path}")
    except Exception as e:
        logger.error(f"BGM download failed: {e}")


def process_video_pipeline(manifest: RenderManifest):
    from video_assembler import assemble_master_video, generate_subtitles
    from thumbnail_gen import generate_thumbnail_variants
    from tiktok_cutter import extract_tiktok_clips
    from clean_temp import clean_assets_directory
    from distributor import upload_to_youtube, send_telegram_notification

    video_id = manifest.episode_id
    assets_root = os.getenv("ASSETS_DIR", "./assets_temp")
    assets_dir = os.path.join(assets_root, str(video_id))
    final_output_dir = os.path.join(assets_root, "final_output")

    try:
        # 1. Upsert video record
        with SessionLocal() as db:
            existing = db.execute(text("SELECT id FROM videos WHERE id = :id"), {"id": video_id}).fetchone()
            if not existing:
                db.execute(
                    text("INSERT INTO videos (id, topic_title, status) VALUES (:id, :title, 'rendering')"),
                    {"id": video_id, "title": manifest.title},
                )
            else:
                db.execute(
                    text("UPDATE videos SET status = 'rendering' WHERE id = :id"), {"id": video_id}
                )
            db.commit()

        # 2. Budget pre-check
        total_estimated = len(manifest.scenes) * COST_PER_SCENE
        budget_limit = float(os.getenv("BUDGET_LIMIT_PER_VIDEO", "100"))
        if total_estimated > budget_limit:
            raise ValueError(f"Estimated cost ${total_estimated:.2f} exceeds budget ${budget_limit:.2f}")

        logger.info(f"[{video_id}] Starting pipeline: {len(manifest.scenes)} scenes, est. ${total_estimated:.2f}")

        # 3. Prepare BGM before parallel scene processing
        bgm_path = os.path.join(assets_root, "bgm", "background.mp3")
        _ensure_bgm(bgm_path)

        # 4. Parallel scene asset download/generation
        runway_key = os.getenv("VIDEO_API_KEY", "")
        elevenlabs_key = os.getenv("ELEVENLABS_API_KEY", "")
        voice_id = os.getenv("ELEVENLABS_VOICE_ID", "")

        scene_args = [
            (order, scene, assets_dir, runway_key, elevenlabs_key, voice_id)
            for order, scene in enumerate(manifest.scenes)
        ]

        completed_scenes = []
        total_cost = 0.0

        with ThreadPoolExecutor(max_workers=MAX_PARALLEL_SCENES) as executor:
            futures = {executor.submit(_download_single_scene, args): args[0] for args in scene_args}
            for future in as_completed(futures):
                try:
                    scene_order, scene, results = future.result()
                    scene_status = "completed" if results.get("video_path") else "failed"
                    total_cost += COST_PER_SCENE
                    completed_scenes.append((scene_order, scene, results, scene_status))
                    logger.info(f"[{video_id}] Scene {scene_order} done: {scene_status}")
                except Exception as e:
                    scene_order = futures[future]
                    logger.error(f"[{video_id}] Scene {scene_order} exception: {e}")

        # 5. Persist scene results
        with SessionLocal() as db:
            for scene_order, scene, results, scene_status in completed_scenes:
                db.execute(
                    text(
                        "INSERT INTO scenes (video_id, scene_index, audio_path, video_path, "
                        "voiceover_text, status) VALUES (:vid, :idx, :apath, :vpath, :votext, :status)"
                    ),
                    {
                        "vid": video_id,
                        "idx": scene_order,
                        "apath": results.get("audio_path"),
                        "vpath": results.get("video_path"),
                        "votext": scene.narration_excerpt,
                        "status": scene_status,
                    },
                )
            db.execute(
                text("INSERT INTO cost_log (video_id, service, cost_usd) VALUES (:vid, :svc, :cost)"),
                {"vid": video_id, "svc": "pipeline_total", "cost": total_cost},
            )
            db.commit()

        # 6. Assemble video
        logger.info(f"[{video_id}] Assembling video...")
        assemble_master_video(str(video_id))
        generate_subtitles(str(video_id))
        generate_thumbnail_variants(str(video_id), [], [])

        # 7. Optional TikTok/Shorts clips
        if manifest.highlights:
            extract_tiktok_clips(str(video_id), manifest.highlights)

        # 8. Upload to YouTube
        master_video_path = os.path.join(final_output_dir, f"master_video_{video_id}.mp4")
        seo = manifest.seo or {}
        youtube_url = upload_to_youtube(
            video_path=master_video_path,
            title=seo.get("final_title", manifest.title),
            description=seo.get("description", ""),
            tags=seo.get("tags", manifest.seo_keywords),
        )

        # 9. Update DB status
        with SessionLocal() as db:
            db.execute(
                text("UPDATE videos SET status = 'uploaded', total_cost_usd = :cost WHERE id = :id"),
                {"id": video_id, "cost": total_cost},
            )
            db.commit()

        logger.info(f"[{video_id}] ✅ Pipeline complete. Cost: ${total_cost:.2f}")

        # 10. Telegram notification
        msg = (
            f"✅ <b>RENDER COMPLETE</b>\n\n"
            f"🎬 <b>Title:</b> {manifest.title}\n"
            f"💰 <b>AI Cost:</b> ${total_cost:.2f}\n"
            f"📺 <b>YouTube:</b> {youtube_url or 'Not uploaded'}\n"
            f"🎞️ <b>Scenes:</b> {len(manifest.scenes)}"
        )
        thumb_path = os.path.join(final_output_dir, f"thumbnails_{video_id}", "variant_1.jpg")
        send_telegram_notification(msg, image_path=thumb_path if os.path.exists(thumb_path) else None)

        # 11. Cleanup temp files
        clean_assets_directory(str(video_id))

        # 12. Notify n8n completion webhook (Workflow 03)
        _notify_n8n_completion(video_id, manifest.title, youtube_url, total_cost)

    except Exception as e:
        logger.error(f"[{video_id}] ❌ Pipeline failed: {e}", exc_info=True)
        try:
            with SessionLocal() as db:
                db.execute(text("UPDATE videos SET status = 'failed' WHERE id = :id"), {"id": video_id})
                db.commit()
        except Exception as db_err:
            logger.error(f"[{video_id}] Could not update failed status in DB: {db_err}")
        from distributor import send_telegram_notification
        send_telegram_notification(f"❌ <b>PIPELINE FAILED</b>\n\nVideo: {video_id}\nError: {e}")


def _notify_n8n_completion(video_id: str, title: str, youtube_url: str, cost: float):
    """Ping n8n Workflow 03 webhook when pipeline completes."""
    n8n_base = os.getenv("N8N_WEBHOOK_URL", "")
    if not n8n_base:
        return
    try:
        import requests
        requests.post(
            f"{n8n_base}/webhook/render-complete",
            json={"video_id": video_id, "title": title, "youtube_url": youtube_url, "cost_usd": cost},
            timeout=10,
        )
    except Exception as e:
        logger.warning(f"Could not notify n8n completion webhook: {e}")


@app.post("/api/v1/render")
async def trigger_render(request: RenderManifest, background_tasks: BackgroundTasks):
    background_tasks.add_task(process_video_pipeline, request)
    return {"status": "accepted", "episode_id": request.episode_id, "scenes": len(request.scenes)}


@app.get("/api/v1/status/{video_id}")
def get_status(video_id: str):
    with SessionLocal() as db:
        row = db.execute(
            text("SELECT status, total_cost_usd, created_at FROM videos WHERE id = :id"),
            {"id": video_id},
        ).fetchone()
    if not row:
        return {"error": "not_found"}
    return {"video_id": video_id, "status": row[0], "total_cost_usd": float(row[1] or 0)}


@app.get("/health")
def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
