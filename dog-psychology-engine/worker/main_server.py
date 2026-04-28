import os
import logging
from fastapi import FastAPI, BackgroundTasks, HTTPException
from pydantic import BaseModel
import uvicorn
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/dog_engine")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

app = FastAPI(title="Dog Psychology Render Worker", version="2.0.0")


class RenderRequest(BaseModel):
    video_id: int
    topic_title: str = ""


def process_video_pipeline(video_id: int):
    """
    Pipeline xử lý hậu kỳ hoàn chỉnh:
    1. Ghép video + audio → master video
    2. Tạo phụ đề
    3. Tạo thumbnail (3 variants)
    4. Cắt TikTok clips
    5. Dọn rác
    """
    from video_assembler import assemble_master_video, generate_subtitles
    from thumbnail_gen import generate_thumbnail_variants
    from tiktok_cutter import extract_tiktok_clips
    from clean_temp import clean_assets_directory

    try:
        # 1. Update status → rendering
        with SessionLocal() as db:
            db.execute(text("UPDATE videos SET status = 'rendering' WHERE id = :id"), {"id": video_id})
            db.commit()
        logger.info(f"[Video {video_id}] Bắt đầu rendering pipeline.")

        # 2. Ghép video và tạo phụ đề
        assemble_master_video(video_id)
        generate_subtitles(video_id)

        # 3. Tạo thumbnail và TikTok clips
        generate_thumbnail_variants(video_id, [], [])
        extract_tiktok_clips(video_id, [])

        # 4. Update status → uploaded
        with SessionLocal() as db:
            db.execute(text("UPDATE videos SET status = 'uploaded' WHERE id = :id"), {"id": video_id})
            db.commit()
        logger.info(f"[Video {video_id}] ✅ Pipeline hoàn tất.")

        # 5. Dọn rác
        clean_assets_directory(video_id)

    except Exception as e:
        logger.error(f"[Video {video_id}] ❌ Pipeline thất bại: {e}", exc_info=True)
        try:
            with SessionLocal() as db:
                db.execute(text("UPDATE videos SET status = 'failed' WHERE id = :id"), {"id": video_id})
                db.commit()
        except Exception as db_err:
            logger.error(f"[Video {video_id}] Không thể update status failed: {db_err}")


@app.post("/api/v1/render")
async def trigger_render(request: RenderRequest, background_tasks: BackgroundTasks):
    """
    Endpoint được gọi bởi n8n sau khi mọi scenes đã tải xong.
    """
    # Kiểm tra video có tồn tại trong DB không
    with SessionLocal() as db:
        result = db.execute(text("SELECT id, status FROM videos WHERE id = :id"), {"id": request.video_id}).fetchone()
    if not result:
        raise HTTPException(status_code=404, detail=f"Video ID {request.video_id} không tồn tại trong DB.")
    if result[1] == "rendering":
        raise HTTPException(status_code=409, detail=f"Video ID {request.video_id} đang được render.")

    background_tasks.add_task(process_video_pipeline, request.video_id)
    return {"status": "accepted", "message": f"Đã bắt đầu rendering cho video {request.video_id}"}


@app.get("/api/v1/status/{video_id}")
def get_video_status(video_id: int):
    """Kiểm tra trạng thái hiện tại của một video."""
    with SessionLocal() as db:
        result = db.execute(
            text("SELECT id, topic_title, status, total_scenes, completed_scenes, total_cost_usd FROM videos WHERE id = :id"),
            {"id": video_id}
        ).fetchone()
    if not result:
        raise HTTPException(status_code=404, detail="Video not found")
    return {
        "video_id": result[0],
        "topic_title": result[1],
        "status": result[2],
        "total_scenes": result[3],
        "completed_scenes": result[4],
        "total_cost_usd": float(result[5]) if result[5] else 0
    }


@app.get("/health")
def health_check():
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "degraded", "db": str(e)}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
