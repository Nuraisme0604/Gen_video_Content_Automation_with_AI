"""
One-shot script: generate thumbnails for videos that have masterVideoKey but no thumbnailKey.
Run: docker exec vca_python_worker python /app/backfill_thumbnails.py
"""
import os, subprocess, tempfile, sys
from sqlalchemy import create_engine, text

DB = create_engine(os.environ["DATABASE_URL"])

# Use boto3 to download from MinIO + upload thumbnail back
import boto3
S3 = boto3.client(
    "s3",
    endpoint_url=os.environ["S3_ENDPOINT"],
    aws_access_key_id=os.environ["S3_ACCESS_KEY"],
    aws_secret_access_key=os.environ["S3_SECRET_KEY"],
)
BUCKET = os.environ.get("S3_BUCKET_ASSETS", "assets")


def process(video_id: str, master_key: str) -> bool:
    with tempfile.TemporaryDirectory() as tmp:
        master_path = os.path.join(tmp, "master.mp4")
        thumb_path = os.path.join(tmp, "thumb.jpg")
        try:
            S3.download_file(BUCKET, master_key, master_path)
        except Exception as e:
            print(f"  ✗ Download failed: {e}", file=sys.stderr)
            return False

        r = subprocess.run(
            ["ffmpeg", "-y", "-ss", "1", "-i", master_path, "-vframes", "1",
             "-vf", "scale=640:360:force_original_aspect_ratio=increase,crop=640:360",
             "-q:v", "4", thumb_path],
            capture_output=True, timeout=30,
        )
        if r.returncode != 0 or not os.path.exists(thumb_path):
            print(f"  ✗ ffmpeg failed: {r.stderr.decode()[:200]}", file=sys.stderr)
            return False

        thumb_key = f"videos/{video_id}/thumb.jpg"
        try:
            S3.upload_file(thumb_path, BUCKET, thumb_key, ExtraArgs={"ContentType": "image/jpeg"})
        except Exception as e:
            print(f"  ✗ Upload failed: {e}", file=sys.stderr)
            return False

        with DB.begin() as conn:
            conn.execute(
                text('UPDATE videos SET "thumbnailKey" = :tk, "updatedAt" = NOW() WHERE id = :id'),
                {"tk": thumb_key, "id": video_id},
            )
        return True


def main():
    with DB.begin() as conn:
        rows = conn.execute(
            text('SELECT id, "masterVideoKey" FROM videos WHERE "masterVideoKey" IS NOT NULL AND "thumbnailKey" IS NULL ORDER BY "createdAt" DESC')
        ).fetchall()

    print(f"Found {len(rows)} videos needing thumbnails.")
    ok, fail = 0, 0
    for vid, mvk in rows:
        print(f"→ {vid} ({mvk})")
        if process(vid, mvk):
            ok += 1
            print(f"  ✓ Done")
        else:
            fail += 1
    print(f"\nDone: {ok} ok, {fail} failed.")


if __name__ == "__main__":
    main()
