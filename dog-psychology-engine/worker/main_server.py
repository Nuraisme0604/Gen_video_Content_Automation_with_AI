import os
import logging
from typing import List, Optional, Dict, Any
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from asset_downloader import download_assets_for_scene

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/dog_engine")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

app = FastAPI(title="Dog Psychology Render Worker", version="2.0.0")

class RenderScene(BaseModel):
    scene_id: str
    start_sec: int
    end_sec: int
    narration_excerpt: str
    image: Optional[str] = None
    video_url: Optional[str] = None
    task_id: Optional[str] = None
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

def process_video_pipeline(manifest: RenderManifest):
    from video_assembler import assemble_master_video, generate_subtitles
    from thumbnail_gen import generate_thumbnail_variants
    from tiktok_cutter import extract_tiktok_clips
    from clean_temp import clean_assets_directory
    
    video_id = manifest.episode_id
    
    try:
        # 1. Update/Insert Database
        with SessionLocal() as db:
            result = db.execute(text("SELECT id FROM videos WHERE id = :id"), {"id": video_id}).fetchone()
            if not result:
                db.execute(text("INSERT INTO videos (id, topic_title, status) VALUES (:id, :title, 'rendering')"), 
                           {"id": video_id, "title": manifest.title})
            else:
                db.execute(text("UPDATE videos SET status = 'rendering' WHERE id = :id"), {"id": video_id})
            db.commit()

        logger.info(f"[Video {video_id}] Bắt đầu tải Assets và Polling Runway.")
        
        # 2. Download Assets & Polling
        assets_dir = os.path.join(os.getenv("ASSETS_DIR", "./assets_temp"), str(video_id))
        runway_key = os.getenv("VIDEO_API_KEY", "")
        elevenlabs_key = os.getenv("ELEVENLABS_API_KEY", "")
        voice_id = os.getenv("ELEVENLABS_VOICE_ID", "")
        
        total_cost = 0.0
        budget_limit = float(os.getenv("BUDGET_LIMIT_PER_VIDEO", "100"))
        
        for scene in manifest.scenes:
            # Chi phí dự tính: $0.1 cho 1 ảnh OpenAI, $0.05 cho ElevenLabs, $0.5 cho 8s Runway
            cost_this_scene = 0.1 + 0.05 + 0.5 
            total_cost += cost_this_scene
            
            if total_cost > budget_limit:
                raise Exception(f"Budget exceeded! ${total_cost:.2f} > ${budget_limit:.2f}")
            
            logger.info(f"Downloading assets for scene {scene.scene_id}...")
            results = download_assets_for_scene(
                scene.dict(), 
                assets_dir, 
                runway_key, 
                elevenlabs_key, 
                voice_id
            )
            
            with SessionLocal() as db:
                db.execute(text("INSERT INTO cost_log (video_id, service, cost_usd) VALUES (:vid, :svc, :cost)"),
                           {"vid": video_id, "svc": "All APIs", "cost": cost_this_scene})
                db.execute(text("INSERT INTO scenes (video_id, scene_index, audio_path, video_path) VALUES (:vid, :idx, :apath, :vpath)"),
                           {"vid": video_id, "idx": int(scene.scene_id) if str(scene.scene_id).isdigit() else 0, "apath": results.get("audio_path"), "vpath": results.get("video_path")})
                db.commit()

        # Ensure global BGM
        bgm_dir = os.path.join(os.getenv("ASSETS_DIR", "./assets_temp"), "bgm")
        os.makedirs(bgm_dir, exist_ok=True)
        bgm_path = os.path.join(bgm_dir, "calm_music.mp3")
        if not os.path.exists(bgm_path):
            import requests
            logger.info("Downloading default BGM...")
            try:
                r = requests.get("https://github.com/rafaelreis-hotmart/Audio-Sample-files/raw/master/sample.mp3", timeout=10)
                with open(bgm_path, "wb") as f:
                    f.write(r.content)
            except Exception as e:
                logger.error(f"Failed to download BGM: {e}")

        # 3. Assemble
        logger.info(f"[Video {video_id}] Tải xong. Bắt đầu ghép Video.")
        # Chú ý: code assemble của user hiện tại đang dùng int. Cần cập nhật sau nếu cần string.
        # Ở đây ta giả sử video_assembler nhận string episode_id.
        assemble_master_video(str(video_id))
        generate_subtitles(str(video_id))
        generate_thumbnail_variants(str(video_id), [], [])
        extract_tiktok_clips(str(video_id), [])

        # 4. Upload & Notify
        from distributor import upload_to_youtube, send_telegram_notification
        
        youtube_url = upload_to_youtube(
            video_path=f"{assets_dir}/master_video.mp4",
            title=manifest.seo.get("final_title", manifest.title) if manifest.seo else manifest.title,
            description=manifest.seo.get("description", "") if manifest.seo else "",
            tags=manifest.seo.get("tags", []) if manifest.seo else []
        )
        
        with SessionLocal() as db:
            db.execute(text("UPDATE videos SET status = 'uploaded', total_cost_usd = :cost WHERE id = :id"), 
                       {"id": video_id, "cost": total_cost})
            db.commit()
            
        logger.info(f"[Video {video_id}] ✅ Pipeline hoàn tất. Chi phí: ${total_cost:.2f}")

        msg = f"✅ <b>RENDER THÀNH CÔNG</b>\n\n"
        msg += f"🎬 <b>Tiêu đề:</b> {manifest.title}\n"
        msg += f"💰 <b>Chi phí AI:</b> ${total_cost:.2f}\n"
        msg += f"📺 <b>YouTube Link:</b> {youtube_url}\n"
        
        # Lấy ảnh thumbnail đầu tiên để gửi kèm Telegram
        thumb_path = f"{assets_dir}/thumbnail_0.jpg"
        send_telegram_notification(msg, image_path=thumb_path if os.path.exists(thumb_path) else None)

        # 5. Dọn rác
        clean_assets_directory(str(video_id))

    except Exception as e:
        logger.error(f"[Video {video_id}] ❌ Pipeline thất bại: {e}", exc_info=True)
        try:
            with SessionLocal() as db:
                db.execute(text("UPDATE videos SET status = 'failed' WHERE id = :id"), {"id": video_id})
                db.commit()
        except Exception as db_err:
            pass

@app.post("/api/v1/render")
async def trigger_render(request: RenderManifest, background_tasks: BackgroundTasks):
    background_tasks.add_task(process_video_pipeline, request)
    return {"status": "accepted", "message": f"Đã bắt đầu pipeline cho video {request.episode_id}"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
