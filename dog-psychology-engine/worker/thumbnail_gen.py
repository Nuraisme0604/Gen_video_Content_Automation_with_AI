import os
import logging
from PIL import Image, ImageDraw, ImageFont

logger = logging.getLogger(__name__)

ASSETS_DIR = os.getenv("ASSETS_DIR", "/assets_temp")
# Font path: được cài trong Dockerfile
FONT_PATH = "/usr/share/fonts/truetype/montserrat/Montserrat-Bold.ttf"


def generate_thumbnail_variants(video_id: str, keyframes: list, texts: list):
    """
    Chèn chữ vào ảnh keyframe để tạo thumbnail YouTube (1280x720).
    
    Args:
        video_id: ID video
        keyframes: List đường dẫn ảnh hoặc PIL Image objects
        texts: List chuỗi text overlay cho mỗi variant
    """
    # Fallback: nếu chưa có data, tạo ảnh dummy để test
    if not keyframes:
        logger.info(f"[Video {video_id}] Không có keyframes. Tạo ảnh dummy...")
        img = Image.new('RGB', (1280, 720), color=(73, 109, 137))
        keyframes = [img, img.copy(), img.copy()]
        texts = ["TÂM LÝ CHÓ", "SỰ THẬT BẤT NGỜ", "BÍ MẬT"]

    output_dir = os.path.join(ASSETS_DIR, "final_output", f"thumbnails_{video_id}")
    os.makedirs(output_dir, exist_ok=True)

    # Load font 1 lần duy nhất
    font = _load_font(80)

    for i, (img_src, overlay_text) in enumerate(zip(keyframes, texts)):
        # Đảm bảo img là PIL Image
        if isinstance(img_src, str):
            if os.path.exists(img_src):
                img = Image.open(img_src).convert("RGB")
            else:
                logger.warning(f"[Thumbnail] File không tồn tại: {img_src}. Bỏ qua.")
                continue
        else:
            img = img_src.copy()  # Copy để không sửa ảnh gốc

        # Resize về chuẩn 1280x720 nếu cần
        if img.size != (1280, 720):
            img = img.resize((1280, 720), Image.LANCZOS)

        draw = ImageDraw.Draw(img)

        # Tính kích thước text
        bbox = draw.textbbox((0, 0), overlay_text, font=font)
        text_w = bbox[2] - bbox[0]
        text_h = bbox[3] - bbox[1]

        W, H = img.size
        x = (W - text_w) / 2
        y = H - text_h - 60  # Cách mép dưới 60px

        # Vẽ viền đen (stroke) rồi chữ trắng
        draw.text((x, y), overlay_text, font=font, fill="white",
                  stroke_width=4, stroke_fill="black")

        variant_path = os.path.join(output_dir, f"variant_{i + 1}.jpg")
        img.save(variant_path, quality=95)
        logger.info(f"[Video {video_id}] ✅ Thumbnail: {variant_path}")


def _load_font(size: int) -> ImageFont.FreeTypeFont:
    """Load font Montserrat Bold, fallback nếu không có."""
    try:
        return ImageFont.truetype(FONT_PATH, size)
    except (IOError, OSError):
        logger.warning(f"Không tìm thấy font {FONT_PATH}. Dùng font mặc định.")
        return ImageFont.load_default()
