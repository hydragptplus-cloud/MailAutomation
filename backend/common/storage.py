import os
import tempfile
import uuid
from pathlib import Path
from urllib.parse import quote

import requests
from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import File
from django.core.files.storage import Storage
from vercel_blob import BlobConfigError, BlobRequestError, delete, head, put


class VercelBlobStorage(Storage):
    """Django storage backend for Vercel Blob media files."""

    def __init__(self, access=None, token=None, store_id=None, public_url_base=None, timeout=30):
        self.access = (access or os.getenv("MEDIA_STORAGE_ACCESS", "public")).lower()
        if self.access not in {"public", "private"}:
            raise ImproperlyConfigured("MEDIA_STORAGE_ACCESS must be 'public' or 'private'.")

        self.token = token or os.getenv("BLOB_READ_WRITE_TOKEN")
        self.store_id = store_id or os.getenv("BLOB_STORE_ID")
        self.public_url_base = (
            public_url_base
            or os.getenv("BLOB_PUBLIC_BASE_URL")
            or os.getenv("MEDIA_STORAGE_PUBLIC_URL_BASE")
            or os.getenv("VERCEL_BLOB_PUBLIC_URL_BASE")
            or ""
        ).rstrip("/")
        self.timeout = timeout
        self._url_cache = {}

        if not self.token:
            raise ImproperlyConfigured("BLOB_READ_WRITE_TOKEN is required for Vercel Blob storage.")

    def _blob_url(self, name):
        path = quote(str(name).replace("\\", "/").lstrip("/"), safe="/")
        if path in self._url_cache:
            return self._url_cache[path]
        if self.public_url_base:
            return f"{self.public_url_base}/{path}"
        if not self.store_id:
            raise ImproperlyConfigured(
                "BLOB_STORE_ID or BLOB_PUBLIC_BASE_URL is required to build Vercel Blob media URLs."
            )
        return f"https://{self.store_id}.{self.access}.blob.vercel-storage.com/{path}"

    def get_valid_name(self, name):
        return str(name).replace("\\", "/").lstrip("/")

    def get_available_name(self, name, max_length=None):
        name = self.get_valid_name(name)
        directory, filename = os.path.split(name)
        stem, suffix = os.path.splitext(filename)
        unique = f"{stem}-{uuid.uuid4().hex[:12]}{suffix}"
        candidate = f"{directory}/{unique}" if directory else unique
        if max_length and len(candidate) > max_length:
            raise ValueError("The generated blob name exceeds max_length.")
        return candidate

    def _read_content(self, content):
        if hasattr(content, "chunks"):
            return b"".join(chunk for chunk in content.chunks())
        return content.read()

    def _save(self, name, content):
        name = self.get_available_name(name)
        data = self._read_content(content)
        multipart = len(data) >= 5 * 1024 * 1024
        try:
            result = put(
                name,
                data,
                options={"token": self.token, "addRandomSuffix": False, "allowOverwrite": False},
                timeout=self.timeout,
                multipart=multipart,
            )
        except (BlobConfigError, BlobRequestError) as exc:
            raise ImproperlyConfigured(f"Vercel Blob upload failed: {exc}") from exc

        saved_name = str(result.get("pathname") or name).replace("\\", "/").lstrip("/")
        if result.get("url"):
            self._url_cache[saved_name] = result["url"]
        return saved_name

    def delete(self, name):
        if not name:
            return
        try:
            delete(self._blob_url(name), options={"token": self.token}, timeout=self.timeout)
        except BlobRequestError:
            return

    def exists(self, name):
        try:
            head(self._blob_url(name), options={"token": self.token}, timeout=self.timeout)
            return True
        except BlobRequestError:
            return False

    def url(self, name):
        return self._blob_url(name)

    def _open(self, name, mode="rb"):
        if "r" not in mode:
            raise ValueError("VercelBlobStorage only supports read mode.")

        headers = {"Authorization": f"Bearer {self.token}"} if self.access == "private" else {}
        response = requests.get(self._blob_url(name), timeout=self.timeout, stream=True, headers=headers)
        response.raise_for_status()

        temp = tempfile.SpooledTemporaryFile(max_size=5 * 1024 * 1024, mode="w+b")
        for chunk in response.iter_content(chunk_size=1024 * 256):
            if chunk:
                temp.write(chunk)
        temp.seek(0)
        return File(temp, name=Path(name).name)
