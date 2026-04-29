import os
import logging
from moviepy.editor import VideoFileClip, AudioFileClip, concatenate_videoclips, CompositeAudioClip, afx
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)

# Config
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/dog_engine")
ASSETS_DIR = os.getenv("ASSETS_DIR", "/assets_temp")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def assemble_master_video(video_id: str):
    """
    Ghép các video clip lại, mix audio với nhạc nền và áp dụng Audio Ducking.
    """
    logger.info(f"[Video {video_id}] Bắt đầu assemble video...")

    # 1. Fetch scenes từ DB
    with SessionLocal() as db:
        scenes = db.execute(
            text("SELECT id, scene_index, video_path, audio_path FROM scenes WHERE video_id = :id AND status = 'completed' ORDER BY scene_index ASC"),
            {"id": video_id}
        ).fetchall()

    if not scenes:
        logger.warning(f"[Video {video_id}] Không có scenes nào (status=completed) để ghép.")
        return

    video_clips = []

    # 2. Xử lý từng scene
    for scene in scenes:
        scene_id, scene_idx, v_path, a_path = scene

        if not v_path or not os.path.exists(v_path):
            logger.warning(f"[Scene {scene_id}] Video path không tồn tại: {v_path}")
            continue

        try:
            v_clip = VideoFileClip(v_path)
            if a_path and os.path.exists(a_path):
                a_clip = AudioFileClip(a_path)
                # Đồng bộ duration: lấy min giữa video và audio
                min_duration = min(v_clip.duration, a_clip.duration)
                v_clip = v_clip.subclip(0, min_duration).set_audio(a_clip.subclip(0, min_duration))
            video_clips.append(v_clip)
        except Exception as e:
            logger.error(f"[Scene {scene_id}] Lỗi khi load clip: {e}")

    if not video_clips:
        logger.error(f"[Video {video_id}] Không load được video clips nào.")
        return

    # 3. Nối các video lại với nhau
    master_video = concatenate_videoclips(video_clips, method="compose")
    logger.info(f"[Video {video_id}] Đã ghép {len(video_clips)} clips. Tổng thời lượng: {master_video.duration:.1f}s")

    # 4. Thêm nhạc nền (Static Ducking: BGM giữ mức 15% volume xuyên suốt)
    bgm_path = os.path.join(ASSETS_DIR, "bgm", "calm_music.mp3")
    if os.path.exists(bgm_path):
        bgm_clip = AudioFileClip(bgm_path)
        bgm_clip = afx.audio_loop(bgm_clip, duration=master_video.duration)
        bgm_clip = bgm_clip.volumex(0.15)  # 15% volume — an toàn cho narration

        if master_video.audio:
            final_audio = CompositeAudioClip([master_video.audio, bgm_clip])
            master_video = master_video.set_audio(final_audio)
        else:
            master_video = master_video.set_audio(bgm_clip)
    else:
        logger.info(f"[Video {video_id}] Không tìm thấy nhạc nền tại {bgm_path}. Bỏ qua BGM.")

    # 5. Xuất file final
    output_dir = os.path.join(ASSETS_DIR, "final_output")
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, f"master_video_{video_id}.mp4")

    try:
        master_video.write_videofile(
            output_path,
            fps=24,
            codec="libx264",
            audio_codec="aac",
            temp_audiofile=os.path.join(output_dir, f"temp_audio_{video_id}.m4a"),
            remove_temp=True
        )
    finally:
        for clip in video_clips:
            clip.close()
        master_video.close()

    logger.info(f"[Video {video_id}] ✅ Hoàn thành xuất video: {output_path}")


def generate_subtitles(video_id: str):
    """
    Sinh file SRT từ voiceover_text đã có trong DB.
    Phiên bản MVP: tạo SRT dựa trên ước lượng thời gian mỗi scene.
    """
    logger.info(f"[Video {video_id}] Đang tạo phụ đề...")

    with SessionLocal() as db:
        scenes = db.execute(
            text("SELECT scene_index, voiceover_text FROM scenes WHERE video_id = :id AND status = 'completed' ORDER BY scene_index ASC"),
            {"id": video_id}
        ).fetchall()

    if not scenes:
        logger.warning(f"[Video {video_id}] Không có dữ liệu scenes để tạo SRT.")
        return

    scene_duration = float(os.getenv("SCENE_VIDEO_SECONDS", "8"))
    output_dir = os.path.join(ASSETS_DIR, "final_output")
    os.makedirs(output_dir, exist_ok=True)
    srt_path = os.path.join(output_dir, f"subtitles_{video_id}.srt")

    with open(srt_path, "w", encoding="utf-8") as f:
        for i, (scene_idx, text_content) in enumerate(scenes):
            if not text_content:
                continue
            start_sec = i * scene_duration
            end_sec = start_sec + scene_duration
            start_ts = _format_srt_time(start_sec)
            end_ts = _format_srt_time(end_sec)
            f.write(f"{i + 1}\n{start_ts} --> {end_ts}\n{text_content.strip()}\n\n")

    logger.info(f"[Video {video_id}] ✅ Đã tạo phụ đề: {srt_path}")


def _format_srt_time(seconds: float) -> str:
    """Chuyển giây thành timestamp SRT: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
