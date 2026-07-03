import os
import logging
import requests
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

_VIDEO_COSTS = {
    "veo3": 0.59,
    "runway": 0.59,
    "slideshow": 0.04,
    "local": 0.04,
}

def _cost_per_scene(provider: str = None, model: str = None) -> float:
    p = (provider or os.getenv("VIDEO_PROVIDER", "slideshow")).lower()
    return _VIDEO_COSTS.get(p, 0.65)


def _b64_or_url_to_file(image_data: str, dest_path: str) -> bool:
    """Lưu ảnh trả về từ provider (data URI base64 hoặc http URL) vào file (Phase 4 — regenerate-image)."""
    from pathlib import Path
    Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
    if image_data.startswith("data:"):
        import base64
        try:
            b64 = image_data.split(",", 1)[1]
            Path(dest_path).write_bytes(base64.b64decode(b64))
            return True
        except Exception as e:
            logger.error(f"Failed to decode data URL: {e}")
            return False
    if image_data.startswith("http"):
        from asset_downloader import download_file
        return download_file(image_data, dest_path)
    return False


def _generate_image_via_provider(image_provider: Dict[str, Any], prompt: str) -> Optional[str]:
    """Gọi thẳng API ảnh (Gemini/OpenAI/Pexels) theo config đã resolve từ backend
    (cùng shape với providers.image trong manifest n8n). Trả về data URI/URL, None nếu fail."""
    fmt = image_provider.get("requestFormat")
    url = image_provider.get("url")
    auth_mode = image_provider.get("authMode")
    auth_name = image_provider.get("authName")
    auth_value = image_provider.get("authValue")
    headers = {"Content-Type": "application/json"}
    params: Dict[str, str] = {}
    if auth_mode == "header":
        headers[auth_name] = auth_value
    elif auth_mode == "query":
        params[auth_name] = auth_value

    try:
        if fmt == "gemini_image":
            body = {"contents": [{"parts": [{"text": prompt}]}], "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}}
            r = requests.post(url, headers=headers, params=params, json=body, timeout=60)
            r.raise_for_status()
            parts = r.json().get("candidates", [{}])[0].get("content", {}).get("parts", [])
            for p in parts:
                inline = p.get("inlineData")
                if inline and inline.get("data"):
                    return f"data:{inline.get('mimeType', 'image/png')};base64,{inline['data']}"
            return None
        if fmt == "openai_image":
            body = {"model": image_provider.get("model"), "prompt": prompt, "size": "1536x1024"}
            r = requests.post(url, headers=headers, json=body, timeout=60)
            r.raise_for_status()
            data = r.json().get("data", [{}])[0]
            return f"data:image/png;base64,{data['b64_json']}" if data.get("b64_json") else data.get("url")
        if fmt == "pexels_photo":
            r = requests.get(url, headers=headers, params={**params, "query": prompt[:100], "per_page": 1, "orientation": "landscape"}, timeout=15)
            r.raise_for_status()
            photos = r.json().get("photos", [])
            return photos[0]["src"]["large"] if photos else None
    except Exception as e:
        logger.error(f"Image provider call failed ({fmt}): {e}")
        return None
    return None


def _all_scenes_failed_error(manifest: "RenderManifest", completed_scenes: list) -> str:
    provider = (manifest.video_provider or os.getenv("VIDEO_PROVIDER", "slideshow")).lower()
    details = []
    for scene_order, _, results, _ in sorted(completed_scenes, key=lambda entry: entry[0]):
        missing = []
        if not results.get("video_path"):
            missing.append("video")
        if not results.get("image_path"):
            missing.append("image")
        if not results.get("audio_path"):
            missing.append("voiceover")
        details.append(f"scene {scene_order + 1}: missing {', '.join(missing) or 'unknown asset'}")
    detail_text = "; ".join(details) if details else "no scene results returned"
    return (
        f"All {len(manifest.scenes)} scenes failed using video provider '{provider}'. "
        f"{detail_text}."
    )

app = FastAPI(title="Content Engine Worker", version="3.0.0")


from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.requests import Request


@app.exception_handler(RequestValidationError)
async def _log_validation_error(request: Request, exc: RequestValidationError):
    """Diagnostic: log which manifest field n8n sent that failed validation."""
    logger.error(f"422 on {request.url.path}: {exc.errors()}")
    return JSONResponse(status_code=422, content={"detail": exc.errors()})


class RenderScene(BaseModel):
    scene_id: str
    start_sec: float = 0
    end_sec: float = 8
    narration_text: str = ''
    narration_excerpt: Optional[str] = None  # legacy field name from older n8n workflow
    image: Optional[str] = None        # Legacy field name
    image_url: Optional[str] = None    # Pre-generated image URL
    image_provider: Optional[str] = None  # Actual source of image_url (gemini | pexels | picsum) — set by n8n
    video_url: Optional[str] = None    # Pre-rendered video URL (skip generation)
    task_id: Optional[str] = None      # Runway task ID (if pre-submitted by n8n)
    video_prompt: Optional[str] = None # Prompt for worker to generate video (Veo3/Runway)
    sound_design: Optional[str] = None

    def model_post_init(self, __context) -> None:
        # Accept both field names: older n8n workflow emits narration_excerpt.
        if not self.narration_text and self.narration_excerpt:
            self.narration_text = self.narration_excerpt


class RenderManifest(BaseModel):
    episode_id: str
    workspace: str
    title: str
    projectId: Optional[str] = None
    narration_script: str = ''          # optional — scenes carry their own narration_text
    thumbnail_text: str = ''
    seo_keywords: List[str] = []
    scenes: List[RenderScene]
    seo: Optional[Dict[str, Any]] = None
    highlights: Optional[List[Dict[str, Any]]] = None  # For TikTok/Shorts clips
    core_emotion: Optional[str] = None  # Drives Suno BGM mood (e.g. "melancholic", "tense", "uplifting")
    thumbnail_url: Optional[str] = None  # DALL-E thumbnail URL from n8n
    video_provider: Optional[str] = None  # Per-project user choice (BE injects from Project.videoProvider); None → env
    burn_subtitles: Optional[bool] = None  # Per-project; BE injects from Project.burnSubtitles
    disable_bgm: Optional[bool] = None  # Per-project; BE injects from Project.disableBgm
    balance_fix: Optional[str] = None  # Phase 7: 'ai_repair' | 'local_resplit' | None — set by n8n if scene word-balance needed correction


def _emit_scene_progress(video_id: str, scene_index: int, status: str) -> None:
    """Fire-and-forget webhook for per-scene progress (L.1)."""
    try:
        requests.post(
            f"{os.getenv('BACKEND_URL', 'http://backend:3001')}/api/v1/webhooks/worker/scene-progress",
            json={"videoId": video_id, "sceneIndex": scene_index, "status": status},
            timeout=5,
        )
    except Exception:
        pass


def _emit_render_event(video_id: str, level: str, stage: str, message: str) -> None:
    """Fire-and-forget webhook for the "nhật ký" error/step timeline (Phase 3)."""
    try:
        requests.post(
            f"{os.getenv('BACKEND_URL', 'http://backend:3001')}/api/v1/webhooks/worker/render-event",
            json={"videoId": video_id, "level": level, "stage": stage, "message": message},
            timeout=5,
        )
    except Exception:
        pass


def _download_single_scene(args: tuple) -> tuple:
    """Worker function for ThreadPoolExecutor."""
    scene_order, scene, assets_dir, runway_key, elevenlabs_key, voice_id, video_id, video_provider = args
    _emit_scene_progress(video_id, scene_order, "rendering")
    results = download_assets_for_scene(
        scene.model_dump(), assets_dir, runway_key, elevenlabs_key, voice_id, video_provider
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

    thumb_path = os.path.join(assets_dir, f"thumbnail_source_{manifest.episode_id}.jpg")
    try:
        os.makedirs(assets_dir, exist_ok=True)
        if manifest.thumbnail_url.startswith("data:"):
            import base64
            b64 = manifest.thumbnail_url.split(",", 1)[1]
            with open(thumb_path, "wb") as f:
                f.write(base64.b64decode(b64))
        else:
            import requests
            r = requests.get(manifest.thumbnail_url, timeout=60)
            r.raise_for_status()
            with open(thumb_path, "wb") as f:
                f.write(r.content)
        logger.info(f"[{manifest.episode_id}] Saved thumbnail source: {thumb_path}")
    except Exception as e:
        logger.error(f"[{manifest.episode_id}] Failed to save thumbnail_url: {e}")
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
            project_id = getattr(manifest, 'projectId', None) or getattr(manifest, 'project_id', None)
            if not existing:
                if not project_id:
                    raise ValueError("projectId required to create new video record")
                db.execute(
                    text('INSERT INTO videos (id, "projectId", title, status, "createdAt", "updatedAt") VALUES (:id, :pid, :title, \'rendering\', NOW(), NOW())'),
                    {"id": video_id, "pid": project_id, "title": manifest.title},
                )
            else:
                db.execute(
                    text('UPDATE videos SET status = \'rendering\', "updatedAt" = NOW() WHERE id = :id'), {"id": video_id}
                )
            db.commit()

        # 2. Budget pre-check
        scene_cost = _cost_per_scene(manifest.video_provider)
        total_estimated = len(manifest.scenes) * scene_cost
        budget_limit = float(os.getenv("BUDGET_LIMIT_PER_VIDEO", "100"))
        if total_estimated > budget_limit:
            raise ValueError(f"Estimated cost ${total_estimated:.2f} exceeds budget ${budget_limit:.2f}")

        logger.info(f"[{video_id}] Starting pipeline: {len(manifest.scenes)} scenes, est. ${total_estimated:.2f}")
        _emit_render_event(video_id, "info", "images", f"Bắt đầu tải ảnh + lồng tiếng cho {len(manifest.scenes)} cảnh")
        if manifest.balance_fix:
            label = "AI tự sửa lại" if manifest.balance_fix == "ai_repair" else "hệ thống tự chia lại cục bộ"
            _emit_render_event(video_id, "warn", "script", f"Lời thoại giữa các cảnh lệch cân bằng — đã {label}.")

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
            (order, scene, assets_dir, runway_key, elevenlabs_key, voice_id, video_id, manifest.video_provider)
            for order, scene in enumerate(manifest.scenes)
        ]

        for order in range(len(manifest.scenes)):
            _emit_scene_progress(video_id, order, "queued")

        completed_scenes = []
        total_cost = 0.0

        with ThreadPoolExecutor(max_workers=MAX_PARALLEL_SCENES) as executor:
            futures = {executor.submit(_download_single_scene, args): args[0] for args in scene_args}
            for future in as_completed(futures):
                try:
                    scene_order, scene, results = future.result()
                    scene_status = "completed" if results.get("video_path") else "failed"
                    _emit_scene_progress(video_id, scene_order, "done" if scene_status == "completed" else "failed")
                    # Chỉ tính cost cho scenes thực sự thành công
                    if scene_status == "completed":
                        total_cost += scene_cost
                    # J.2: checkpoint — upload clip to MinIO immediately after scene done
                    if results.get("video_path"):
                        try:
                            from storage import upload_file as s3_upload
                            clip_key = f"videos/{video_id}/clips/clip_{scene_order:03d}.mp4"
                            if s3_upload(results["video_path"], clip_key, "video/mp4"):
                                results["clip_key"] = clip_key
                                logger.info(f"[{video_id}] Scene {scene_order} checkpoint uploaded: {clip_key}")
                        except Exception as ue:
                            logger.warning(f"[{video_id}] Scene {scene_order} checkpoint upload failed: {ue}")
                    completed_scenes.append((scene_order, scene, results, scene_status))
                    logger.info(f"[{video_id}] Scene {scene_order} done: {scene_status}")
                except Exception as e:
                    scene_order = futures[future]
                    logger.error(f"[{video_id}] Scene {scene_order} exception: {e}")
                    _emit_scene_progress(video_id, scene_order, "failed")

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
                    _emit_render_event(video_id, "error", "images" if "video" in missing else "voice", f"Cảnh {scene_order + 1} thất bại: {err_msg}")
                elif scene.image_provider in ("pexels", "picsum"):
                    label = "ảnh stock Pexels" if scene.image_provider == "pexels" else "ảnh dự phòng (placeholder)"
                    _emit_render_event(video_id, "warn", "images", f"Cảnh {scene_order + 1}: nguồn ảnh chính hết quota/lỗi → đã dùng {label}")

                import uuid as _u
                scene_id = f"{video_id}_{scene_order}"
                db.execute(
                    text(
                        'INSERT INTO scenes (id, "videoId", "sceneIndex", "voiceoverText", '
                        '"audioKey", "videoKey", "imageKey", "imageProvider", "durationSec", status, "errorMessage", "costUsd", "updatedAt") '
                        'VALUES (:id, :vid, :idx, :votext, :apath, :vpath, :ipath, :imgprov, :dur, :status, :err, :cost, NOW()) '
                        'ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, "errorMessage" = EXCLUDED."errorMessage", "durationSec" = EXCLUDED."durationSec", "imageProvider" = EXCLUDED."imageProvider", "updatedAt" = NOW()'
                    ),
                    {
                        "id": scene_id,
                        "vid": video_id,
                        "idx": scene_order,
                        "votext": scene.narration_text,
                        "apath": results.get("audio_path"),
                        "vpath": results.get("clip_key") or results.get("video_path"),
                        "ipath": results.get("image_path"),
                        "imgprov": scene.image_provider,
                        "dur": results.get("duration"),
                        "status": scene_status,
                        "err": err_msg,
                        "cost": scene_cost if scene_status == "completed" else 0.0,
                    },
                )
            db.execute(
                text('INSERT INTO cost_log (id, "videoId", service, "costUsd") VALUES (:id, :vid, :svc, :cost)'),
                {"id": str(_u.uuid4()), "vid": video_id, "svc": "pipeline_total", "cost": total_cost},
            )
            db.commit()

        # 5b. Fail-fast nếu 0 scenes thành công (tránh mark "uploaded" giả)
        completed_count = sum(1 for _, _, _, status in completed_scenes if status == "completed")
        if completed_count == 0:
            raise RuntimeError(_all_scenes_failed_error(manifest, completed_scenes))
        if completed_count < len(manifest.scenes):
            logger.warning(f"[{video_id}] Only {completed_count}/{len(manifest.scenes)} scenes completed — continuing with partial video")

        # 6. Assemble master video (always)
        master_video_key = None
        thumbnail_key = None
        master_video_path = os.path.join(final_output_dir, f"master_video_{video_id}.mp4")

        logger.info(f"[{video_id}] Assembling video...")
        _emit_render_event(video_id, "info", "assemble", "Đang ghép video, tạo phụ đề...")
        assemble_master_video(str(video_id), disable_bgm=manifest.disable_bgm)
        generate_subtitles(str(video_id))
        burn_subtitles_into_video(str(video_id), force=bool(manifest.burn_subtitles))  # per-project burnSubtitles

        # 6b. Generate thumbnail variants from DALL-E URL (if provided)
        thumbnail_keyframes, thumbnail_texts = _prepare_thumbnail_inputs(manifest, assets_dir)
        generate_thumbnail_variants(str(video_id), thumbnail_keyframes, thumbnail_texts)

        # 7. Optional TikTok/Shorts clips
        if manifest.highlights:
            extract_tiktok_clips(str(video_id), manifest.highlights, title=manifest.title)

        # 8. Upload to YouTube (returns empty string if creds missing or upload fails)
        seo = manifest.seo or {}
        youtube_url = upload_to_youtube(
            video_path=master_video_path,
            title=seo.get("final_title", manifest.title),
            description=seo.get("description", ""),
            tags=seo.get("tags", manifest.seo_keywords),
        )

        # 9. Upload master video + thumbnail + per-scene clips to MinIO.
        # Per-scene clips are ALWAYS uploaded so users can download individual scenes
        # for external editing (CapCut/Premiere/etc.) in addition to the master.
        try:
            from storage import upload_file as s3_upload
            if os.path.exists(master_video_path):
                master_video_key = s3_upload(master_video_path, f"videos/{video_id}/master.mp4", "video/mp4")
            thumb_local = os.path.join(final_output_dir, f"thumb_{video_id}.jpg")
            if os.path.exists(thumb_local):
                thumbnail_key = s3_upload(thumb_local, f"videos/{video_id}/thumb.jpg", "image/jpeg")
            # Upload each scene's video clip to videos/{id}/clips/clip_{idx:03d}.mp4
            # Scenes already uploaded as J.2 checkpoint are skipped
            _checkpoint_keys = {o: r.get("clip_key") for o, _, r, _ in completed_scenes}
            for idx, scene in enumerate(manifest.scenes):
                if _checkpoint_keys.get(idx):
                    continue
                local_path = os.path.join(assets_dir, f"scene_{scene.scene_id}_video.mp4")
                if os.path.exists(local_path):
                    clip_key = f"videos/{video_id}/clips/clip_{idx:03d}.mp4"
                    s3_key = s3_upload(local_path, clip_key, "video/mp4")
                    if s3_key:
                        with SessionLocal() as db:
                            db.execute(
                                text('UPDATE scenes SET "videoKey" = :k, "updatedAt" = NOW() WHERE "videoId" = :v AND "sceneIndex" = :i'),
                                {"k": clip_key, "v": video_id, "i": idx},
                            )
                            db.commit()
        except Exception as e:
            logger.error(f"[{video_id}] MinIO upload failed: {e}")

        # 10. Update DB status (include masterVideoKey + thumbnailKey)
        final_status = "uploaded" if youtube_url else "rendered"
        with SessionLocal() as db:
            db.execute(
                text('UPDATE videos SET status = :status, "totalCostUsd" = :cost, "youtubeVideoId" = :yt, "masterVideoKey" = :mvk, "thumbnailKey" = :tk, "durationSec" = :dur, "updatedAt" = NOW() WHERE id = :id'),
                {
                    "id": video_id,
                    "status": final_status,
                    "cost": total_cost,
                    "yt": youtube_url.split("v=")[-1] if youtube_url else None,
                    "mvk": master_video_key,
                    "tk": thumbnail_key,
                    "dur": len(manifest.scenes) * int(os.getenv("SCENE_VIDEO_SECONDS", "8")),
                },
            )
            db.commit()

        # 10b. Notify NestJS backend so Socket.IO clients update + emit job:complete
        try:
            backend_url = os.getenv("BACKEND_URL", "http://backend:3001")
            requests.post(
                f"{backend_url}/api/v1/webhooks/worker/render-complete",
                json={
                    "videoId": video_id,
                    "masterVideoKey": master_video_key,
                    "thumbnailKey": thumbnail_key,
                    "durationSec": len(manifest.scenes) * int(os.getenv("SCENE_VIDEO_SECONDS", "8")),
                    "totalCostUsd": total_cost,
                    "success": True,
                },
                timeout=10,
            )
        except Exception as e:
            logger.warning(f"[{video_id}] Backend webhook failed: {e}")

        logger.info(f"[{video_id}] ✅ Pipeline complete. Cost: ${total_cost:.2f}")
        _emit_render_event(video_id, "info", "done", f"Hoàn thành — {completed_count}/{len(manifest.scenes)} cảnh thành công, chi phí ${total_cost:.2f}")

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
        _emit_render_event(video_id, "error", "assemble", f"Pipeline lỗi: {str(e)[:300]}")
        try:
            with SessionLocal() as db:
                db.execute(text('UPDATE videos SET status = \'failed\', "errorMsg" = :err, "updatedAt" = NOW() WHERE id = :id'), {"id": video_id, "err": str(e)[:500]})
                db.commit()
        except Exception as db_err:
            logger.error(f"[{video_id}] Could not update failed status in DB: {db_err}")
        # Notify backend on failure too
        try:
            backend_url = os.getenv("BACKEND_URL", "http://backend:3001")
            requests.post(
                f"{backend_url}/api/v1/webhooks/worker/render-complete",
                json={"videoId": video_id, "success": False, "error": str(e)[:500]},
                timeout=10,
            )
        except Exception:
            pass
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


class RegenerateImageRequest(BaseModel):
    video_id: str
    scene_index: int
    prompt: Optional[str] = None
    image_provider: Dict[str, Any]  # resolved provider config — same shape as manifest providers.image


def _regenerate_scene_image_task(req: "RegenerateImageRequest") -> None:
    video_id, idx = req.video_id, req.scene_index
    assets_root = os.getenv("ASSETS_DIR", "/assets_temp")
    scene_dir = os.path.join(assets_root, str(video_id))
    os.makedirs(scene_dir, exist_ok=True)
    try:
        with SessionLocal() as db:
            row = db.execute(
                text('SELECT "imagePrompt", "durationSec" FROM scenes WHERE "videoId" = :v AND "sceneIndex" = :i'),
                {"v": video_id, "i": idx},
            ).fetchone()
        if not row:
            raise RuntimeError(f"Scene {idx} không tồn tại")
        prompt = req.prompt or row[0] or "cinematic photo, 16:9"
        duration = float(row[1]) if row[1] else float(os.getenv("SCENE_VIDEO_SECONDS", "8"))

        image_data = _generate_image_via_provider(req.image_provider, prompt)
        if not image_data:
            raise RuntimeError("Provider ảnh trả rỗng")
        img_path = os.path.join(scene_dir, f"scene_{idx + 1}_regen_image.jpg")
        if not _b64_or_url_to_file(image_data, img_path):
            raise RuntimeError("Không lưu được ảnh mới")

        clip_path = os.path.join(scene_dir, f"scene_{idx + 1}_video.mp4")
        import subprocess
        cmd = [
            "ffmpeg", "-y", "-loop", "1", "-i", img_path,
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-t", f"{duration:.3f}", "-pix_fmt", "yuv420p",
            "-vf", "scale=1920:1080:flags=lanczos:force_original_aspect_ratio=increase,crop=1920:1080",
            "-r", "30", clip_path,
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=120)
        if r.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {r.stderr.decode()[:300]}")

        from storage import upload_file as s3_upload
        clip_key = s3_upload(clip_path, f"videos/{video_id}/clips/clip_{idx:03d}.mp4", "video/mp4")

        with SessionLocal() as db:
            db.execute(
                text(
                    'UPDATE scenes SET "videoKey" = :vk, "imageKey" = :ik, "imagePrompt" = :ip, '
                    '"imageProvider" = :iprov, "regenCount" = "regenCount" + 1, "updatedAt" = NOW() '
                    'WHERE "videoId" = :v AND "sceneIndex" = :i'
                ),
                {"vk": clip_key, "ik": img_path, "ip": prompt, "iprov": req.image_provider.get("provider"), "v": video_id, "i": idx},
            )
            db.commit()
        _emit_render_event(video_id, "info", "images", f"Đã sinh lại ảnh cho cảnh {idx + 1}")
        _emit_scene_progress(video_id, idx, "done")
    except Exception as e:
        logger.error(f"[{video_id}] Regenerate image scene {idx} failed: {e}")
        _emit_render_event(video_id, "error", "images", f"Sinh lại ảnh cảnh {idx + 1} thất bại: {e}")


@app.post("/api/v1/scenes/regenerate-image")
async def regenerate_scene_image(req: RegenerateImageRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_regenerate_scene_image_task, req)
    return {"status": "accepted", "video_id": req.video_id, "scene_index": req.scene_index}


class RegenerateVoiceRequest(BaseModel):
    video_id: str
    scene_index: int


def _regenerate_scene_voice_task(req: "RegenerateVoiceRequest") -> None:
    from video_assembler import _ensure_local
    from asset_downloader import generate_voiceover, _audio_duration
    video_id, idx = req.video_id, req.scene_index
    assets_root = os.getenv("ASSETS_DIR", "/assets_temp")
    scene_dir = os.path.join(assets_root, str(video_id))
    os.makedirs(scene_dir, exist_ok=True)
    try:
        with SessionLocal() as db:
            row = db.execute(
                text('SELECT "voiceoverText", "videoKey" FROM scenes WHERE "videoId" = :v AND "sceneIndex" = :i'),
                {"v": video_id, "i": idx},
            ).fetchone()
        if not row or not row[0]:
            raise RuntimeError(f"Scene {idx} không có voiceoverText")
        text_content, video_key = row[0], row[1]

        audio_path = os.path.join(scene_dir, f"scene_{idx + 1}_voice.mp3")
        voice_id = os.getenv("ELEVENLABS_VOICE_ID", "")
        if not generate_voiceover(text_content, audio_path, voice_id, os.getenv("ELEVENLABS_API_KEY", "")):
            raise RuntimeError("Sinh voice thất bại (edge-tts)")
        duration = _audio_duration(audio_path) or 8.0

        # Ảnh gốc local đã bị dọn sau khi video hoàn tất → trích lại frame đầu từ clip hiện có
        # (clip là ảnh tĩnh giữ nguyên suốt N giây nên frame đầu = ảnh gốc).
        local_clip = _ensure_local(video_key)
        if not local_clip or not os.path.exists(local_clip):
            raise RuntimeError("Không tìm thấy clip hiện có để lấy lại ảnh nền")
        img_path = os.path.join(scene_dir, f"scene_{idx + 1}_frame.jpg")
        import subprocess
        fr = subprocess.run(["ffmpeg", "-y", "-i", local_clip, "-vframes", "1", img_path], capture_output=True, timeout=30)
        if fr.returncode != 0 or not os.path.exists(img_path):
            raise RuntimeError("Không trích được ảnh từ clip cũ")

        clip_path = os.path.join(scene_dir, f"scene_{idx + 1}_video.mp4")
        cmd = [
            "ffmpeg", "-y", "-loop", "1", "-i", img_path,
            "-c:v", "libx264", "-preset", "medium", "-crf", "20",
            "-t", f"{duration:.3f}", "-pix_fmt", "yuv420p",
            "-vf", "scale=1920:1080:flags=lanczos:force_original_aspect_ratio=increase,crop=1920:1080",
            "-r", "30", clip_path,
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=120)
        if r.returncode != 0:
            raise RuntimeError(f"ffmpeg failed: {r.stderr.decode()[:300]}")

        from storage import upload_file as s3_upload
        clip_key = s3_upload(clip_path, f"videos/{video_id}/clips/clip_{idx:03d}.mp4", "video/mp4")

        with SessionLocal() as db:
            db.execute(
                text(
                    'UPDATE scenes SET "videoKey" = :vk, "durationSec" = :dur, "regenCount" = "regenCount" + 1, "updatedAt" = NOW() '
                    'WHERE "videoId" = :v AND "sceneIndex" = :i'
                ),
                {"vk": clip_key, "dur": duration, "v": video_id, "i": idx},
            )
            db.commit()
        _emit_render_event(video_id, "info", "voice", f"Đã sinh lại voice cho cảnh {idx + 1}")
        _emit_scene_progress(video_id, idx, "done")
    except Exception as e:
        logger.error(f"[{video_id}] Regenerate voice scene {idx} failed: {e}")
        _emit_render_event(video_id, "error", "voice", f"Sinh lại voice cảnh {idx + 1} thất bại: {e}")


@app.post("/api/v1/scenes/regenerate-voice")
async def regenerate_scene_voice(req: RegenerateVoiceRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_regenerate_scene_voice_task, req)
    return {"status": "accepted", "video_id": req.video_id, "scene_index": req.scene_index}


class ReassembleRequest(BaseModel):
    video_id: str
    burn_subtitles: Optional[bool] = None
    disable_bgm: Optional[bool] = None


def _reassemble_video_task(req: "ReassembleRequest") -> None:
    from video_assembler import assemble_master_video, generate_subtitles, burn_subtitles_into_video
    video_id = req.video_id
    assets_root = os.getenv("ASSETS_DIR", "/assets_temp")
    final_output_dir = os.path.join(assets_root, "final_output")
    master_video_path = os.path.join(final_output_dir, f"master_video_{video_id}.mp4")
    try:
        _emit_render_event(video_id, "info", "assemble", "Đang ghép lại video sau khi chỉnh sửa cảnh...")
        assemble_master_video(str(video_id), disable_bgm=req.disable_bgm)
        generate_subtitles(str(video_id))
        burn_subtitles_into_video(str(video_id), force=bool(req.burn_subtitles))

        if not os.path.exists(master_video_path):
            raise RuntimeError("Ghép video thất bại — không tạo được master.mp4")

        from storage import upload_file as s3_upload
        master_video_key = s3_upload(master_video_path, f"videos/{video_id}/master.mp4", "video/mp4")

        with SessionLocal() as db:
            db.execute(
                text('UPDATE videos SET status = \'done\', "masterVideoKey" = :mvk, "updatedAt" = NOW() WHERE id = :id'),
                {"mvk": master_video_key, "id": video_id},
            )
            db.commit()

        requests.post(
            f"{os.getenv('BACKEND_URL', 'http://backend:3001')}/api/v1/webhooks/worker/render-complete",
            json={"videoId": video_id, "masterVideoKey": master_video_key, "success": True},
            timeout=10,
        )
        _emit_render_event(video_id, "info", "done", "Đã ghép lại video thành công")
    except Exception as e:
        logger.error(f"[{video_id}] Reassemble failed: {e}")
        _emit_render_event(video_id, "error", "assemble", f"Ghép lại video thất bại: {e}")


@app.post("/api/v1/videos/reassemble")
async def reassemble_video(req: ReassembleRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(_reassemble_video_task, req)
    return {"status": "accepted", "video_id": req.video_id}


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
