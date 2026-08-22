import gzip
import io
import json
import logging
import os
import shutil
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from django.conf import settings
from django.core.management import call_command
from vercel import blob

logger = logging.getLogger(__name__)

BACKUP_APPS = [
    "users",
    "recipients",
    "campaigns",
    "templates_app",
    "smtp_manager",
    "email_engine",
    "billing",
    "reports",
    "dashboard",
]

BACKUP_EXCLUDES = [
    "contenttypes",
    "auth.Permission",
    "sessions.Session",
    "admin.LogEntry",
]

BACKUP_BLOB_PREFIX = "db_backups"
BACKUP_BLOB_ACCESS = "private"


def generate_backup_filename() -> str:
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return f"mailflow_backup_{timestamp}.json.gz"


def dump_database_to_gzip_bytes() -> bytes:
    """Exports Django business data and compresses it into gzip bytes in memory."""
    buf = io.StringIO()
    call_command(
        "dumpdata",
        *BACKUP_APPS,
        exclude=BACKUP_EXCLUDES,
        natural_foreign=True,
        natural_primary=True,
        format="json",
        indent=2,
        stdout=buf,
    )
    json_bytes = buf.getvalue().encode("utf-8")
    return gzip.compress(json_bytes)


def create_database_backup(
    local_path: Optional[str] = None,
    upload_to_blob: bool = True,
    retention_count: int = 14,
    token: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Creates a full database backup, compresses it, saves it locally and/or uploads it to Vercel Blob.
    Automatically prunes older backups in Vercel Blob beyond retention_count.
    """
    blob_token = token or os.getenv("BLOB_READ_WRITE_TOKEN")
    if upload_to_blob and not blob_token:
        raise ValueError("BLOB_READ_WRITE_TOKEN is required to upload a database backup.")

    filename = generate_backup_filename()
    compressed_data = dump_database_to_gzip_bytes()
    data_size = len(compressed_data)
    result: Dict[str, Any] = {
        "filename": filename,
        "size_bytes": data_size,
        "created_at": datetime.utcnow().isoformat() + "Z",
        "saved_local": None,
        "blob_url": None,
        "blob_pathname": None,
    }

    # 1. Save locally if requested
    if local_path:
        local_file = Path(local_path)
        if local_file.is_dir():
            local_file = local_file / filename
        local_file.parent.mkdir(parents=True, exist_ok=True)
        with open(local_file, "wb") as f:
            f.write(compressed_data)
        result["saved_local"] = str(local_file.resolve())

    # 2. Upload to Vercel Blob if requested
    if upload_to_blob:
        blob_pathname = f"{BACKUP_BLOB_PREFIX}/{filename}"
        try:
            put_result = blob.put(
                blob_pathname,
                compressed_data,
                access=BACKUP_BLOB_ACCESS,
                token=blob_token,
                add_random_suffix=False,
                overwrite=True,
                content_type="application/gzip",
            )
            result["blob_url"] = put_result.url
            result["blob_pathname"] = put_result.pathname or blob_pathname
            logger.info(f"Successfully uploaded database backup to Vercel Blob: {result['blob_pathname']}")

            # Prune older backups in Vercel Blob
            if retention_count > 0:
                prune_older_blob_backups(keep_count=retention_count, token=blob_token)
        except Exception as exc:
            logger.error(f"Failed to upload database backup to Vercel Blob: {exc}")
            raise RuntimeError(f"Failed to upload database backup to Vercel Blob: {exc}") from exc

    return result


def list_blob_backups(token: Optional[str] = None) -> List[Dict[str, Any]]:
    """Lists all database backups stored in Vercel Blob, sorted newest first."""
    blob_token = token or os.getenv("BLOB_READ_WRITE_TOKEN")
    if not blob_token:
        raise ValueError("BLOB_READ_WRITE_TOKEN environment variable is required to list backups.")

    resp = blob.list_objects(prefix=f"{BACKUP_BLOB_PREFIX}/", token=blob_token)
    blobs = [
        {
            "url": item.url,
            "downloadUrl": item.download_url,
            "pathname": item.pathname,
            "size": item.size,
            "uploadedAt": item.uploaded_at,
        }
        for item in resp.blobs
    ]
    # Sort descending by uploadedAt / pathname
    blobs.sort(key=lambda x: x.get("uploadedAt") or x.get("pathname", ""), reverse=True)
    return blobs


def prune_older_blob_backups(keep_count: int = 14, token: Optional[str] = None) -> int:
    """Keeps the newest `keep_count` backups and deletes the rest from Vercel Blob."""
    blob_token = token or os.getenv("BLOB_READ_WRITE_TOKEN")
    if not blob_token:
        return 0

    try:
        blobs = list_blob_backups(token=blob_token)
        if len(blobs) <= keep_count:
            return 0

        to_delete = blobs[keep_count:]
        urls_to_delete = [b["url"] for b in to_delete if b.get("url")]
        if urls_to_delete:
            blob.delete(urls_to_delete, token=blob_token)
            logger.info(f"Pruned {len(urls_to_delete)} old database backups from Vercel Blob.")
            return len(urls_to_delete)
    except Exception as exc:
        logger.warning(f"Error during backup pruning: {exc}")
    return 0


def download_blob_backup(
    backup_pathname_or_url: str,
    destination_path: Optional[str] = None,
    token: Optional[str] = None,
) -> str:
    """Downloads a backup file from Vercel Blob to a local destination or temporary file."""
    blob_token = token or os.getenv("BLOB_READ_WRITE_TOKEN")
    url = backup_pathname_or_url
    if not url.startswith("http://") and not url.startswith("https://"):
        blobs = list_blob_backups(token=blob_token)
        match = next(
            (b for b in blobs if b.get("pathname") == backup_pathname_or_url or b.get("pathname", "").endswith(backup_pathname_or_url)),
            None,
        )
        if not match or not match.get("url"):
            raise ValueError(f"Backup '{backup_pathname_or_url}' not found in Vercel Blob.")
        url = match["url"]

    if destination_path:
        dest = Path(destination_path)
        dest.parent.mkdir(parents=True, exist_ok=True)
    else:
        suffix = ".json.gz" if url.endswith(".gz") else ".json"
        fd, temp_dest = tempfile.mkstemp(suffix=suffix, prefix="mailflow_download_")
        os.close(fd)
        dest = Path(temp_dest)

    try:
        blob.download_file(
            url,
            dest,
            access=BACKUP_BLOB_ACCESS,
            token=blob_token,
            timeout=60,
            overwrite=True,
            create_parents=True,
        )
    except Exception:
        if not destination_path and dest.exists():
            try:
                dest.unlink()
            except OSError:
                pass
        raise

    return str(dest.resolve())


def restore_database_from_file(file_path: str) -> Dict[str, Any]:
    """
    Restores the database from a JSON or GZIP-compressed JSON file.
    Executes loaddata inside Django.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Backup file does not exist: {file_path}")

    # If it's a gzip file, decompress to temporary JSON file first
    is_gzip = path.suffix.lower() == ".gz" or str(path).endswith(".json.gz")
    if is_gzip:
        with tempfile.NamedTemporaryFile("wb", suffix=".json", delete=False) as tmp_json:
            tmp_json_path = tmp_json.name
            with gzip.open(path, "rb") as gz_in:
                shutil.copyfileobj(gz_in, tmp_json)
        target_json_path = tmp_json_path
    else:
        target_json_path = str(path.resolve())

    try:
        # Load data into Django database
        call_command("loaddata", target_json_path)
        return {
            "success": True,
            "file": str(path),
            "is_gzip": is_gzip,
            "message": "Database restored successfully.",
        }
    finally:
        if is_gzip and os.path.exists(target_json_path):
            try:
                os.remove(target_json_path)
            except OSError:
                pass
