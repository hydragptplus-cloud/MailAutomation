from pathlib import Path
from django.core.management.base import BaseCommand
from common.backup import create_database_backup, list_blob_backups


class Command(BaseCommand):
    help = "Creates a compressed database dump and uploads it to Vercel Blob and/or saves locally."

    def add_arguments(self, parser):
        parser.add_argument(
            "--local-only",
            action="store_true",
            help="Only save backup locally; do not upload to Vercel Blob.",
        )
        parser.add_argument(
            "--output",
            type=str,
            default=None,
            help="Local directory or file path to save the backup (e.g. 'backups/').",
        )
        parser.add_argument(
            "--retention",
            type=int,
            default=14,
            help="Number of latest backups to retain in Vercel Blob (default: 14).",
        )
        parser.add_argument(
            "--token",
            type=str,
            default=None,
            help="Optional Vercel Blob token (overrides BLOB_READ_WRITE_TOKEN env var).",
        )
        parser.add_argument(
            "--list",
            action="store_true",
            help="List existing database backups in Vercel Blob without creating a new one.",
        )

    def handle(self, *args, **options):
        if options.get("list"):
            self.stdout.write("Fetching database backups from Vercel Blob...")
            try:
                blobs = list_blob_backups(token=options.get("token"))
                if not blobs:
                    self.stdout.write(self.style.WARNING("No database backups found in Vercel Blob."))
                    return
                self.stdout.write(self.style.SUCCESS(f"Found {len(blobs)} backup(s):"))
                for b in blobs:
                    size_kb = (b.get("size", 0) or 0) / 1024
                    self.stdout.write(
                        f"  - {b.get('pathname')} | {size_kb:.1f} KB | {b.get('uploadedAt', 'N/A')} | URL: {b.get('url')}"
                    )
            except Exception as exc:
                self.stdout.write(self.style.ERROR(f"Failed to list backups: {exc}"))
            return

        upload_to_blob = not options.get("local_only")
        local_path = options.get("output")
        # If not uploading to blob and no output path given, default output to backups/
        if not upload_to_blob and not local_path:
            local_path = "backups/"

        self.stdout.write("Generating compressed database backup...")
        try:
            result = create_database_backup(
                local_path=local_path,
                upload_to_blob=upload_to_blob,
                retention_count=options.get("retention", 14),
                token=options.get("token"),
            )
            size_kb = result["size_bytes"] / 1024
            self.stdout.write(self.style.SUCCESS(f"Backup generated successfully: {result['filename']} ({size_kb:.1f} KB)"))

            if result.get("saved_local"):
                self.stdout.write(f"Saved locally: {result['saved_local']}")

            if result.get("blob_pathname"):
                self.stdout.write(self.style.SUCCESS(f"Uploaded to Vercel Blob: {result['blob_pathname']}"))
                self.stdout.write(f"Blob URL: {result['blob_url']}")
        except Exception as exc:
            self.stdout.write(self.style.ERROR(f"Backup failed: {exc}"))
            raise
