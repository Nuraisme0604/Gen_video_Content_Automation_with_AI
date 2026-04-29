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

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@postgres:5432/content_engine")
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
    core_emotion: Optional[str] = None  # Drives Suno BGM mood (e.g. "melancholic", "tense", "uplifting")
    thumbnail_url: Optional[str] = None  # DALL-E thumbnail URL from n8n


def _download_single_scene(args: tuple) -> tuple:
    """Worker function for ThreadPoolExecutor."""
    scene_order, scene, assets_dir, runway_key, elevenlabs_key, voice_id = args
    results = download_assets_for_scene(
        scene.model_dump(), assets_dir, runway_key, elevenlabs_key, voice_id
    )
    return scene_order, scene, results


def _prepare_thumbnail_inputs(manifest: "RenderManifest", assets_dir: str) -> tuple:
    """
    Download DALL-E thumbnail từ manifest.thumbnail_url, build texts list từ
    thumbnail_text + seo_keywords để generate 3 variants. Trả về ([], []) nếu thiếu data.
    """
    if not manifest.thumbnail_url:
        logger.warning(f"[{manifest.episode_id}] No thumbnail_url in manifest. Skipping thumbnail gen.")
        return [], []

    import requests
    thumb_path = os.path.join(assets_dir, f"thumbnail_source_{manifest.episode_id}.jpg")
    try:
        os.makedirs(assets_dir, exist_ok=True)
        r = requests.get(manifest.thumbnail_url, timeout=60)
        r.raise_for_status()
        with open(thumb_path, "wb") as f:
            f.write(r.content)
        logger.info(f"[{manifest.episode_id}] Downloaded thumbnail source: {thumb_path}")
    except Exception as e:
        logger.error(f"[{manifest.episode_id}] Failed to download thumbnail_url: {e}")
        return [], []

    # 3 variants: dùng thumbnail_text + 2 seo keywords làm overlay
    keywords = (manifest.seo_keywords or [])[:2]
    texts = [manifest.thumbnail_text] + [k.upper() for k in keywords if k]
    # Fallback nếu thiếu keywords
    while len(texts) < 3:
        texts.append(manifest.thumbnail_text)
    texts = texts[:3]

    return [thumb_path], texts


def _ensure_bgm(bgm_path: str, core_emotion: Optional[str] = None, video_duration_sec: Optional[int] = None):
    """
    Generate or download background music.
    Provider order: try MUSIC_PROVIDER (default elevenlabs) → fallback static URL.

    Args:
        video_duration_sec: Estimated video duration. BGM length = min(video_duration, 600s API max).
                            ElevenLabs Music API caps at 600,000ms (10 min). Longer videos sẽ
                            được loop với crossfade trong video_assembler.
    """
    if os.path.exists(bgm_path):
        return

    os.makedirs(os.path.dirname(bgm_path), exist_ok=True)
    music_provider = os.getenv("MUSIC_PROVIDER", "elevenlabs").lower()

    # Build prompt — emotion-aware if available
    if core_emotion:
        prompt = (
            f"{core_emotion} cinematic background music, instrumental only, no vocals, "
            f"documentary style, fitting the emotional tone of {core_emotion}"
        )
    else:
        prompt = os.getenv("BGM_PROMPT", "calm ambient background music, emotional, no vocals")

    # Adaptive duration: match video length, capped by API + env override
    api_max_ms = 600000  # ElevenLabs Music hard limit
    env_override_ms = int(os.getenv("BGM_DURATION_MS", "0"))
    if env_override_ms > 0:
        duration_ms = min(api_max_ms, max(60000, env_override_ms))
    elif video_duration_sec:
        # Generate slightly longer than video so loop crossfade has room
        target_ms = int(video_duration_sec * 1000 * 1.1)
        duration_ms = min(api_max_ms, max(60000, target_ms))
    else:
        duration_ms = 120000  # Fallback default 2 min

    if music_provider == "elevenlabs":
        from elevenlabs_music import generate_bgm as eleven_gen
        logger.info(f"Generating BGM via ElevenLabs Music (emotion='{core_emotion or 'default'}', duration={duration_ms}ms = {duration_ms/1000:.0f}s)...")
        if eleven_gen(prompt, bgm_path, duration_ms=duration_ms):
            return

    elif music_provider == "suno":
        # Legacy/optional: Suno via unofficial endpoint. Set MUSIC_PROVIDER=suno + SUNO_API_KEY explicitly.
        from suno_client import generate_bgm as suno_gen
        logger.warning("Using Suno via unofficial endpoint (studio-api.suno.ai). "
                       "Recommend switching to MUSIC_PROVIDER=elevenlabs for stability.")
        if suno_gen(prompt, bgm_path):
            return

    # Fallback: download from BGM_FALLBACK_URL (configurable, default = public sample)
    fallback_url = os.getenv(
        "BGM_FALLBACK_URL",
        "https://github.com/rafaelreis-hotmart/Audio-Sample-files/raw/master/sample.mp3",
    )
    logger.info(f"Falling back to static BGM download from {fallback_url}...")
    try:
        import requests
        r = requests.get(fallback_url, timeout=15)
        r.raise_for_status()
        with open(bgm_path, "wb") as f:
            f.write(r.content)
        logger.info(f"Static BGM downloaded to {bgm_path}")
    except Exception as e:
        logger.error(
            f"BGM download failed: {e}. Video sẽ được render KHÔNG có nhạc nền. "
            f"Set BGM_FALLBACK_URL env var hoặc bỏ rỗng BGM file ở {os.path.dirname(bgm_path)} "
            f"thủ công nếu muốn provide BGM tĩnh."
        )


def process_video_pipeline(manifest: RenderManifest):
    from video_assembler import assemble_master_video, generate_subtitles, burn_subtitles_into_video
    from thumbnail_gen import generate_thumbnail_variants
    from tiktok_cutter import extract_tiktok_clips
    from clean_temp import clean_assets_directory
    from distributor import upload_to_youtube, send_telegram_notification

    video_id = manifest.episode_id
    assets_root = os.getenv("ASSETS_DIR", "/assets_temp")
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

        # 3. Prepare BGM before parallel scene processing (emotion-aware, per-video, adaptive duration)
        bgm_path = os.path.join(assets_root, "bgm", f"background_{video_id}.mp3")
        scene_seconds = int(os.getenv("SCENE_VIDEO_SECONDS", "8"))
        estimated_video_sec = len(manifest.scenes) * scene_seconds
        _ensure_bgm(bgm_path, manifest.core_emotion, video_duration_sec=estimated_video_sec)

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
                    # Chỉ tính cost cho scenes thực sự thành công
                    if scene_status == "completed":
                        total_cost += COST_PER_SCENE
                    completed_scenes.append((scene_order, scene, results, scene_status))
                    logger.info(f"[{video_id}] Scene {scene_order} done: {scene_status}")
                except Exception as e:
                    scene_order = futures[future]
                    logger.error(f"[{video_id}] Scene {scene_order} exception: {e}")

        # 5. Persist scene results — ghi đủ tất cả columns trong schema
        with SessionLocal() as db:
            for scene_order, scene, results, scene_status in completed_scenes:
                # Build error_message nếu scene fail (null nếu OK)
                err_msg = None
                if scene_status == "failed":
                    missing = []
                    if not results.get("video_path"): missing.append("video")
                    if not results.get("audio_path"): missing.append("voiceover")
                    err_msg = f"Asset gen failed: {', '.join(missing) or 'unknown'}"

                db.execute(
                    text(
                        "INSERT INTO scenes (video_id, scene_index, voiceover_text, "
                        "audio_path, video_path, image_path, status, error_message, cost_usd) "
                        "VALUES (:vid, :idx, :votext, :apath, :vpath, :ipath, :status, :err, :cost)"
                    ),
                    {
                        "vid": video_id,
                        "idx": scene_order,
                        "votext": scene.narration_excerpt,
                        "apath": results.get("audio_path"),
                        "vpath": results.get("video_path"),
                        "ipath": results.get("image_path"),
                        "status": scene_status,
                        "err": err_msg,
                        "cost": COST_PER_SCENE if scene_status == "completed" else 0.0,
                    },
                )
            db.execute(
                text("INSERT INTO cost_log (video_id, service, cost_usd) VALUES (:vid, :svc, :cost)"),
                {"vid": video_id, "svc": "pipeline_total", "cost": total_cost},
            )
            db.commit()

        # 5b. Fail-fast nếu 0 scenes thành công (tránh mark "uploaded" giả)
        completed_count = sum(1 for _, _, _, status in completed_scenes if status == "completed")
        if completed_count == 0:
            raise RuntimeError(
                f"All {len(manifest.scenes)} scenes failed. "
                f"Check API keys and provider configs (Veo3/Runway video gen + ElevenLabs voice)."
            )
        if completed_count < len(manifest.scenes):
            logger.warning(f"[{video_id}] Only {completed_count}/{len(manifest.scenes)} scenes completed — continuing with partial video")

        # 6. Assemble video
        logger.info(f"[{video_id}] Assembling video...")
        assemble_master_video(str(video_id))
        generate_subtitles(str(video_id))
        burn_subtitles_into_video(str(video_id))  # No-op unless BURN_SUBTITLES=true

        # 6b. Generate thumbnail variants from DALL-E URL (if provided)
        thumbnail_keyframes, thumbnail_texts = _prepare_thumbnail_inputs(manifest, assets_dir)
        generate_thumbnail_variants(str(video_id), thumbnail_keyframes, thumbnail_texts)

        # 7. Optional TikTok/Shorts clips
        if manifest.highlights:
            extract_tiktok_clips(str(video_id), manifest.highlights, title=manifest.title)

        # 8. Upload to YouTube (returns empty string if creds missing or upload fails)
        master_video_path = os.path.join(final_output_dir, f"master_video_{video_id}.mp4")
        seo = manifest.seo or {}
        youtube_url = upload_to_youtube(
            video_path=master_video_path,
            title=seo.get("final_title", manifest.title),
            description=seo.get("description", ""),
            tags=seo.get("tags", manifest.seo_keywords),
        )

        # 9. Update DB status
        # 'uploaded' = thực sự upload thành công lên YouTube (có URL trả về)
        # 'rendered' = master video xong + còn local nhưng chưa lên YouTube (creds thiếu hoặc upload fail)
        final_status = "uploaded" if youtube_url else "rendered"
        with SessionLocal() as db:
            db.execute(
                text("UPDATE videos SET status = :status, total_cost_usd = :cost, youtube_video_id = :yt WHERE id = :id"),
                {
                    "id": video_id,
                    "status": final_status,
                    "cost": total_cost,
                    "yt": youtube_url.split("v=")[-1] if youtube_url else None,
                },
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
