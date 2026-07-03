import os
import logging
import random
import shlex
import subprocess
from moviepy.editor import VideoFileClip, AudioFileClip, concatenate_videoclips, CompositeAudioClip, afx
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)

# Config
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@postgres:5432/content_engine")
ASSETS_DIR = os.getenv("ASSETS_DIR", "/assets_temp")

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _ensure_local(path_or_key):
    """Scene videoKey/audioKey lưu trong DB là S3 key. Nếu file local không còn,
    tải từ MinIO về temp để ghép master."""
    if not path_or_key or os.path.exists(path_or_key):
        return path_or_key
    from storage import download_file
    local = os.path.join("/assets_temp", "_assembly", os.path.basename(path_or_key))
    return local if download_file(path_or_key, local) else None


def assemble_master_video(video_id: str, disable_bgm: bool | None = None):
    """
    Ghép các video clip lại, mix audio với nhạc nền và áp dụng Audio Ducking.
    disable_bgm: None = dùng env DISABLE_BGM; True/False = ưu tiên theo Project.disableBgm.
    """
    logger.info(f"[Video {video_id}] Bắt đầu assemble video...")

    # 1. Fetch scenes từ DB
    with SessionLocal() as db:
        scenes = db.execute(
            text('SELECT id, "sceneIndex" AS scene_index, "videoKey" AS video_path, "audioKey" AS audio_path FROM scenes WHERE "videoId" = :id AND status = \'completed\' ORDER BY "sceneIndex" ASC'),
            {"id": video_id}
        ).fetchall()

    if not scenes:
        logger.warning(f"[Video {video_id}] Không có scenes nào (status=completed) để ghép.")
        return

    video_clips = []
    # Volume mix config
    veo_audio_volume = float(os.getenv("VEO_AUDIO_VOLUME", "0.3"))     # Veo3 native audio (ambient/SFX) at 30%
    voice_volume     = float(os.getenv("VOICE_VOLUME", "1.0"))         # ElevenLabs voiceover at 100%

    # 2. Xử lý từng scene — MIX Veo3 native audio + ElevenLabs voiceover (không replace)
    for scene in scenes:
        scene_id, scene_idx, v_path, a_path = scene

        # videoKey/audioKey trong DB là S3 key — tải về local nếu clip đã bị dọn.
        v_path = _ensure_local(v_path)
        a_path = _ensure_local(a_path)

        if not v_path or not os.path.exists(v_path):
            logger.warning(f"[Scene {scene_id}] Video path không tồn tại: {v_path}")
            continue

        try:
            v_clip = VideoFileClip(v_path)
            veo_native_audio = v_clip.audio  # Veo3 generates ambient + SFX natively

            if a_path and os.path.exists(a_path):
                voice_clip = AudioFileClip(a_path)
                min_duration = min(v_clip.duration, voice_clip.duration)
                voice_clip = voice_clip.subclip(0, min_duration).volumex(voice_volume)

                if veo_native_audio is not None and veo_audio_volume > 0:
                    # MIX: Veo3 native (low) + voiceover (full)
                    veo_quiet = veo_native_audio.subclip(0, min_duration).volumex(veo_audio_volume)
                    final_audio = CompositeAudioClip([veo_quiet, voice_clip])
                    v_clip = v_clip.subclip(0, min_duration).set_audio(final_audio)
                    logger.debug(f"[Scene {scene_id}] Mixed Veo3 audio ({veo_audio_volume*100:.0f}%) + voiceover ({voice_volume*100:.0f}%)")
                else:
                    # Fallback: voiceover only (Veo3 không có audio hoặc bị disable)
                    v_clip = v_clip.subclip(0, min_duration).set_audio(voice_clip)
            else:
                # No voiceover → giữ Veo3 native audio nguyên
                logger.debug(f"[Scene {scene_id}] No voiceover, keeping Veo3 native audio")
            video_clips.append(v_clip)
        except Exception as e:
            logger.error(f"[Scene {scene_id}] Lỗi khi load clip: {e}")

    if not video_clips:
        logger.error(f"[Video {video_id}] Không load được video clips nào.")
        return

    # 3. Nối các video lại với nhau
    master_video = concatenate_videoclips(video_clips, method="compose")
    logger.info(f"[Video {video_id}] Đã ghép {len(video_clips)} clips. Tổng thời lượng: {master_video.duration:.1f}s")

    # 4. Thêm nhạc nền (Audio Ducking + crossfade loop nếu BGM ngắn hơn video)
    # Ưu tiên BGM per-video (emotion-aware từ main_server), fallback về tên cũ
    bgm_path = os.path.join(ASSETS_DIR, "bgm", f"background_{video_id}.mp3")
    if not os.path.exists(bgm_path):
        bgm_path = os.path.join(ASSETS_DIR, "bgm", "background.mp3")
    if not os.path.exists(bgm_path):
        bgm_path = os.path.join(ASSETS_DIR, "bgm", "calm_music.mp3")
    bgm_volume = float(os.getenv("BGM_VOLUME", "0.15"))  # Default 15% — an toàn cho narration
    bgm_disabled = disable_bgm if disable_bgm is not None else os.getenv("DISABLE_BGM", "false").lower() in ("true", "1", "yes")

    if bgm_disabled:
        logger.info(f"[Video {video_id}] DISABLE_BGM=true → bỏ nhạc nền, chỉ giữ tiếng.")
    elif os.path.exists(bgm_path):
        bgm_clip = AudioFileClip(bgm_path)
        # Loop với crossfade nếu BGM ngắn hơn video (tránh hard cut khó chịu)
        if bgm_clip.duration < master_video.duration:
            crossfade_sec = float(os.getenv("BGM_CROSSFADE_SEC", "2.0"))
            logger.info(
                f"[Video {video_id}] BGM ({bgm_clip.duration:.0f}s) < video ({master_video.duration:.0f}s). "
                f"Looping với crossfade {crossfade_sec}s..."
            )
            try:
                bgm_clip = afx.audio_loop(bgm_clip, duration=master_video.duration).audio_fadein(crossfade_sec).audio_fadeout(crossfade_sec)
            except Exception:
                # Fallback: simple loop nếu fadein/fadeout fail
                bgm_clip = afx.audio_loop(bgm_clip, duration=master_video.duration)
        else:
            # BGM dài hơn video — random offset để tránh kẹt quiet intro/outro
            # (sample.mp3 và nhiều bài có intro 0-15s rất nhỏ → 15% volume = inaudible).
            # Skip an toàn 20s đầu (qua intro) và 15s cuối (qua outro fade-out),
            # rồi pick random offset trong khoảng còn lại.
            intro_skip = float(os.getenv("BGM_INTRO_SKIP_SEC", "20"))
            outro_skip = float(os.getenv("BGM_OUTRO_SKIP_SEC", "15"))
            safe_start_max = max(0.0, bgm_clip.duration - master_video.duration - outro_skip)
            if safe_start_max > intro_skip:
                offset = random.uniform(intro_skip, safe_start_max)
                logger.info(
                    f"[Video {video_id}] BGM ({bgm_clip.duration:.0f}s) > video ({master_video.duration:.0f}s). "
                    f"Random offset start={offset:.1f}s (skip intro/outro)"
                )
                bgm_clip = bgm_clip.subclip(offset, offset + master_video.duration)
            else:
                # BGM không đủ dài để skip → fallback start từ 0
                bgm_clip = bgm_clip.subclip(0, master_video.duration)

        bgm_clip = bgm_clip.volumex(bgm_volume)

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
            fps=30,
            codec="libx264",
            audio_codec="aac",
            audio_bitrate="192k",
            ffmpeg_params=["-crf", "20", "-preset", "medium", "-pix_fmt", "yuv420p"],
            temp_audiofile=os.path.join(output_dir, f"temp_audio_{video_id}.m4a"),
            remove_temp=True
        )
    finally:
        for clip in video_clips:
            clip.close()
        master_video.close()

    logger.info(f"[Video {video_id}] ✅ Hoàn thành xuất video: {output_path}")

    # 6. Auto-thumbnail: extract frame at 1s, resize 640x360
    thumb_path = os.path.join(output_dir, f"thumb_{video_id}.jpg")
    try:
        import subprocess
        r = subprocess.run(
            ["ffmpeg", "-y", "-ss", "1", "-i", output_path, "-vframes", "1",
             "-vf", "scale=640:360:force_original_aspect_ratio=increase,crop=640:360",
             "-q:v", "4", thumb_path],
            capture_output=True, timeout=30,
        )
        if r.returncode == 0 and os.path.exists(thumb_path):
            logger.info(f"[Video {video_id}] ✅ Thumbnail: {thumb_path}")
        else:
            logger.warning(f"[Video {video_id}] ffmpeg thumb failed: {r.stderr.decode()[:200]}")
    except Exception as e:
        logger.warning(f"[Video {video_id}] Thumbnail extraction failed: {e}")


def generate_subtitles(video_id: str):
    """
    Sinh file SRT từ voiceover_text đã có trong DB.
    Phiên bản MVP: tạo SRT dựa trên ước lượng thời gian mỗi scene.
    """
    logger.info(f"[Video {video_id}] Đang tạo phụ đề...")

    with SessionLocal() as db:
        scenes = db.execute(
            text('SELECT "voiceoverText" AS voiceover_text, "durationSec" AS dur FROM scenes WHERE "videoId" = :id AND status = \'completed\' ORDER BY "sceneIndex" ASC'),
            {"id": video_id}
        ).fetchall()

    if not scenes:
        logger.warning(f"[Video {video_id}] Không có dữ liệu scenes để tạo SRT.")
        return

    fallback = float(os.getenv("SCENE_VIDEO_SECONDS", "8"))
    output_dir = os.path.join(ASSETS_DIR, "final_output")
    os.makedirs(output_dir, exist_ok=True)
    srt_path = os.path.join(output_dir, f"subtitles_{video_id}.srt")

    cursor = 0.0
    idx = 0
    with open(srt_path, "w", encoding="utf-8") as f:
        for text_content, dur in scenes:
            if not text_content:
                continue
            # Sub khớp thời lượng hình = voice của scene đó (cộng dồn theo durationSec thật).
            d = float(dur) if dur else fallback
            start_ts = _format_srt_time(cursor)
            end_ts = _format_srt_time(cursor + d)
            cursor += d
            idx += 1
            f.write(f"{idx}\n{start_ts} --> {end_ts}\n{text_content.strip()}\n\n")

    logger.info(f"[Video {video_id}] ✅ Đã tạo phụ đề: {srt_path}")


def _format_srt_time(seconds: float) -> str:
    """Chuyển giây thành timestamp SRT: HH:MM:SS,mmm"""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def burn_subtitles_into_video(video_id: str, force: bool = False):
    """
    Burn the SRT subtitle file directly into the master video using ffmpeg.
    Required for TikTok/Shorts where viewers won't toggle CC. Enabled per-project
    (force=True from Project.burnSubtitles) or via env BURN_SUBTITLES=true.
    """
    if not force and os.getenv("BURN_SUBTITLES", "false").lower() not in ("true", "1", "yes"):
        return

    output_dir = os.path.join(ASSETS_DIR, "final_output")
    master_path = os.path.join(output_dir, f"master_video_{video_id}.mp4")
    srt_path = os.path.join(output_dir, f"subtitles_{video_id}.srt")
    burned_path = os.path.join(output_dir, f"master_video_{video_id}.burned.mp4")

    if not os.path.exists(master_path):
        logger.warning(f"[Video {video_id}] Bỏ qua burn-in: không có master video tại {master_path}")
        return
    if not os.path.exists(srt_path):
        logger.warning(f"[Video {video_id}] Bỏ qua burn-in: không có file SRT tại {srt_path}")
        return

    style = os.getenv(
        "SUBTITLE_STYLE",
        "FontName=Arial,FontSize=24,PrimaryColour=&Hffffff,OutlineColour=&H000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=40",
    )
    # ffmpeg subtitle filter requires the path quoted/escaped for filtergraph syntax
    srt_for_filter = srt_path.replace("\\", "/").replace(":", r"\:").replace("'", r"\'")
    vf = f"subtitles='{srt_for_filter}':force_style='{style}'"

    cmd = [
        "ffmpeg", "-y",
        "-i", master_path,
        "-vf", vf,
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-c:a", "copy",
        burned_path,
    ]

    logger.info(f"[Video {video_id}] Burn-in subtitles: {' '.join(shlex.quote(c) for c in cmd)}")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
        if result.returncode != 0:
            logger.error(f"[Video {video_id}] FFmpeg burn-in failed: {result.stderr[-800:]}")
            return
        os.replace(burned_path, master_path)
        logger.info(f"[Video {video_id}] ✅ Subtitles burned into master video")
    except subprocess.TimeoutExpired:
        logger.error(f"[Video {video_id}] FFmpeg burn-in timed out")
    except Exception as e:
        logger.error(f"[Video {video_id}] Burn-in error: {e}")
