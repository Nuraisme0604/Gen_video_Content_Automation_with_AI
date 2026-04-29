import os
import logging
from moviepy.editor import VideoFileClip, TextClip, CompositeVideoClip

logger = logging.getLogger(__name__)

ASSETS_DIR = os.getenv("ASSETS_DIR", "/assets_temp")


def extract_tiktok_clips(video_id: str, highlights: list, title: str = "TÂM LÝ CHÓ"):
    """
    Cắt video master thành các clip ngắn định dạng dọc (9:16) cho TikTok/Shorts.
    
    Args:
        video_id: ID video trong DB
        highlights: Danh sách dict: [{"start": 60, "end": 120, "id": "1"}, ...]
        title: Dòng text sẽ được in cố định trên video (Hardsub).
    """
    master_path = os.path.join(ASSETS_DIR, "final_output", f"master_video_{video_id}.mp4")
    if not os.path.exists(master_path):
        logger.warning(f"[Video {video_id}] Không tìm thấy file master tại {master_path}. Bỏ qua TikTok.")
        return

    if not highlights:
        logger.info(f"[Video {video_id}] Không có highlights nào để cắt TikTok. Bỏ qua.")
        return

    master_clip = VideoFileClip(master_path)
    try:
        for hl in highlights:
            start_t = hl.get("start", 0)
            end_t = hl.get("end", start_t + 60)
            clip_id = hl.get("id", "1")

            end_t = min(end_t, master_clip.duration)
            if start_t >= end_t:
                logger.warning(f"[TikTok clip {clip_id}] Timestamp không hợp lệ: start={start_t}, end={end_t}. Bỏ qua.")
                continue

            sub_clip = master_clip.subclip(start_t, end_t)

            # Crop từ 16:9 về 9:16 (Center crop)
            (w, h) = sub_clip.size
            target_w = int(h * 9 / 16)
            x1 = int((w - target_w) / 2)
            x2 = x1 + target_w

            cropped_clip = sub_clip.crop(x1=x1, y1=0, x2=x2, y2=h)

            # Hardsub: Ép Text lên video
            try:
                txt_clip = TextClip(
                    title,
                    fontsize=70,
                    color='white',
                    font='Montserrat-Bold',
                    stroke_color='black',
                    stroke_width=3,
                    method='caption',
                    size=(target_w - 40, None)
                )
                txt_clip = txt_clip.set_position(('center', int(h * 0.15))).set_duration(cropped_clip.duration)
                final_clip = CompositeVideoClip([cropped_clip, txt_clip])
            except Exception as e:
                logger.error(f"[TikTok clip {clip_id}] Lỗi in TextClip (có thể do thiếu ImageMagick): {e}")
                final_clip = cropped_clip

            output_path = os.path.join(ASSETS_DIR, "final_output", f"tiktok_clip_{video_id}_{clip_id}.mp4")
            try:
                final_clip.write_videofile(
                    output_path,
                    fps=24,
                    codec="libx264",
                    audio_codec="aac",
                    preset="fast"
                )
            finally:
                final_clip.close()
                cropped_clip.close()
            logger.info(f"[Video {video_id}] ✅ TikTok clip: {output_path}")
    finally:
        master_clip.close()
