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
    except ClientError:
        try:
            s3.create_bucket(Bucket=S3_BUCKET)
            logger.info(f"Created bucket {S3_BUCKET}")
        except ClientError as e:
            logger.error(f"Cannot create bucket: {e}")
            return False
    # Always (re)apply public-read so FE can play videos directly. Local/per-machine
    # tool — assets bucket is meant to be public. Idempotent: covers buckets that
    # pre-existed (e.g. created by minio init) without the policy.
    try:
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
    except ClientError as e:
        logger.warning(f"Cannot set public-read policy on {S3_BUCKET}: {e}")
    return True


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


def download_file(key: str, local_path: str) -> bool:
    """Download an S3 object to a local path. Returns True on success."""
    try:
        Path(local_path).parent.mkdir(parents=True, exist_ok=True)
        _client().download_file(S3_BUCKET, key, local_path)
        return True
    except Exception as e:
        logger.error(f"Download failed for {key}: {e}")
        return False


def public_url(key: str) -> str:
    return f"{S3_ENDPOINT}/{S3_BUCKET}/{key}"
