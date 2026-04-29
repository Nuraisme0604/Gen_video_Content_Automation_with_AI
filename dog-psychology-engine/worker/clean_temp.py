import os
import shutil
import logging

logger = logging.getLogger(__name__)

ASSETS_DIR = os.getenv("ASSETS_DIR", "/assets_temp")


def clean_assets_directory(video_id: str):
    """
    Xóa thư mục chứa file tạm sau khi đã upload xong thành công.
    Giữ lại thư mục final_output (chứa video master + thumbnails) vì cần cho upload.
    """
    # Scene assets được lưu tại {ASSETS_DIR}/{video_id}/ bởi asset_downloader
    paths_to_remove = [
        os.path.join(ASSETS_DIR, str(video_id)),
    ]

    cleaned = 0
    for path in paths_to_remove:
        if os.path.exists(path):
            try:
                if os.path.isdir(path):
                    shutil.rmtree(path)
                else:
                    os.remove(path)
                cleaned += 1
                logger.info(f"[Video {video_id}] Đã dọn: {path}")
            except Exception as e:
                logger.error(f"[Video {video_id}] Lỗi dọn {path}: {e}")

    logger.info(f"[Video {video_id}] Dọn xong {cleaned}/{len(paths_to_remove)} mục.")
