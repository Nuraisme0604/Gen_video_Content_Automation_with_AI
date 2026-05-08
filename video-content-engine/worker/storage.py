"""MinIO/S3 upload helper for the worker."""
import os
import logging
from pathlib import Path
import boto3
from botocore.exceptions import ClientError

logger = logging.getLogger(__name__)

S3_ENDPOINT = os.getenv("S3_ENDPOINT", "http://minio:9000")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY", "minioadmin")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY", "change_me_minio")
S3_BUCKET = os.getenv("S3_BUCKET_ASSETS", "assets")


def _client():
    return boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
    )


def ensure_bucket() -> bool:
    s3 = _client()
    try:
        s3.head_bucket(Bucket=S3_BUCKET)
        return True
    except ClientError:
        try:
            s3.create_bucket(Bucket=S3_BUCKET)
            # Public read so FE can play directly
            import json as _json
            policy = {
                "Version": "2012-10-17",
                "Statement": [{
                    "Effect": "Allow", "Principal": "*",
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{S3_BUCKET}/*"],
                }]
            }
            s3.put_bucket_policy(Bucket=S3_BUCKET, Policy=_json.dumps(policy))
            logger.info(f"Created bucket {S3_BUCKET} with public read policy")
            return True
        except ClientError as e:
            logger.error(f"Cannot create bucket: {e}")
            return False


def upload_file(local_path: str, key: str, content_type: str = "video/mp4") -> str | None:
    """Upload a file to MinIO. Returns the S3 key on success, None on failure."""
    if not Path(local_path).exists():
        logger.error(f"File not found for upload: {local_path}")
        return None
    ensure_bucket()
    try:
        s3 = _client()
        with open(local_path, "rb") as f:
            s3.put_object(Bucket=S3_BUCKET, Key=key, Body=f, ContentType=content_type)
        logger.info(f"Uploaded {local_path} → s3://{S3_BUCKET}/{key}")
        return key
    except Exception as e:
        logger.error(f"Upload failed for {local_path}: {e}")
        return None


def public_url(key: str) -> str:
    return f"{S3_ENDPOINT}/{S3_BUCKET}/{key}"
