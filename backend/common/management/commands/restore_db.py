import os
from pathlib import Path
from django.core.management.base import BaseCommand
from common.backup import (
    download_blob_backup,
    list_blob_backups,
    restore_database_from_file,
)


class Command(BaseCommand):
    help = "Restores database from a local file, URL, or latest Vercel Blob backup."

    def add_arguments(self, parser):
        parser.add_argument(
            "--latest",
            action="store_true",
            help="Automatically find, download, and restore the latest backup from Vercel Blob.",
        )
        parser.add_argument(
            "--file",
            type=str,
            default=None,
            help="Path to local .json/.json.gz file, or Vercel Blob pathname / URL to restore from.",
        )
        parser.add_argument(
            "--list",
            action="store_true",
            help="List all backups available in Vercel Blob.",
        )
        parser.add_argument(
            "--token",
            type=str,
            default=None,
            help="Optional Vercel Blob token (overrides BLOB_READ_WRITE_TOKEN env var).",
        )
        parser.add_argument(
            "-y",
            "--yes",
            action="store_true",
            help="Skip confirmation prompt.",
        )

    def handle(self, *args, **options):
        token = options.get("token") or os.getenv("BLOB_READ_WRITE_TOKEN")

        if options.get("list"):
            self.stdout.write("Fetching available database backups from Vercel Blob...")
            try:
                blobs = list_blob_backups(token=token)
                if not blobs:
                    self.stdout.write(self.style.WARNING("No database backups found in Vercel Blob."))
                    return
                self.stdout.write(self.style.SUCCESS(f"Found {len(blobs)} backup(s):"))
                for idx, b in enumerate(blobs, 1):
                    size_kb = (b.get("size", 0) or 0) / 1024
                    self.stdout.write(
                        f"  [{idx}] {b.get('pathname')} | {size_kb:.1f} KB | Uploaded: {b.get('uploadedAt', 'N/A')}"
                    )
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f"Failed to list backups: {exc}"))
            return

        target_file = options.get("file")
        downloaded_temp_path = None

        if options.get("latest"):
            self.stdout.write("Locating latest database backup in Vercel Blob...")
            try:
                blobs = list_blob_backups(token=token)
                if not blobs:
                    self.stdout.write(self.style.ERROR("No backups found in Vercel Blob."))
                    return
                latest_blob = blobs[0]
                self.stdout.write(
                    f"Selected latest backup: {latest_blob.get('pathname')} (Uploaded: {latest_blob.get('uploadedAt')})"
                )
                self.stdout.write("Downloading backup...")
                downloaded_temp_path = download_blob_backup(
                    latest_blob.get("url") or latest_blob.get("pathname"), token=token
                )
                target_file = downloaded_temp_path
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f"Failed to download latest backup: {exc}"))
                return
        elif target_file:
            # Check if target_file is a URL or blob pathname
            if target_file.startswith("http://") or target_file.startswith("https://") or "/" in target_file and not Path(target_file).exists():
                self.stdout.write(f"Downloading backup from '{target_file}'...")
                try:
                    downloaded_temp_path = download_blob_backup(target_file, token=token)
                    target_file = downloaded_temp_path
                except Exception as exc:
                    self.stdout.write(self.style.ERROR(f"Failed to download backup: {exc}"))
                    return
        else:
            self.stdout.write(
                self.style.ERROR("Please specify --latest, --file <path_or_url>, or --list.")
            )
            return

        if not options.get("yes"):
            confirm = input(
                f"Are you sure you want to restore the database from '{target_file}'? Existing matching records may be overwritten. [y/N]: "
            )
            if confirm.strip().lower() not in {"y", "yes"}:
                self.stdout.write("Restore cancelled.")
                if downloaded_temp_path and os.path.exists(downloaded_temp_path):
                    os.remove(downloaded_temp_path)
                return

        self.stdout.write("Restoring database...")
        try:
            res = restore_database_from_file(target_file)
            self.stdout.write(self.style.SUCCESS(f"Success! {res.get('message')}"))
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f"Database restore failed: {exc}"))
            raise
        finally:
            if downloaded_temp_path and os.path.exists(downloaded_temp_path):
                try:
                    os.remove(downloaded_temp_path)
                except OSError:
                    pass
