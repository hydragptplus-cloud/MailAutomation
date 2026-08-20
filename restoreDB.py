#!/usr/bin/env python
"""
Mail Flow Database Restore Utility (restoreDB.py)
-------------------------------------------------
Allows one-click restoration of your database from Vercel Blob or a local file.
Works seamlessly when migrating to a new Railway account, VPS, or recovering from data loss.

Usage:
  python restoreDB.py --latest       # Automatically fetches and restores the newest backup from Vercel Blob
  python restoreDB.py --list         # Lists all available database backups in Vercel Blob
  python restoreDB.py --file <path>  # Restores from a specific local .json/.json.gz or Blob URL
  python restoreDB.py --backup-now   # Immediately creates a new backup and uploads to Blob
"""

import os
import sys
from pathlib import Path

# Add backend directory to Python path
CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Configure Django settings
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

try:
    import django
    django.setup()
except Exception as e:
    print(f"Error initializing Django environment: {e}")
    sys.exit(1)

from django.core.management import call_command


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Mail Flow Database Restore & Backup Utility",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python restoreDB.py --latest       # Fetch and restore newest backup from Vercel Blob
  python restoreDB.py --list         # List all backups in Vercel Blob
  python restoreDB.py --file backups/my_backup.json.gz
  python restoreDB.py --backup-now   # Create an immediate backup to Vercel Blob
        """,
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--latest",
        action="store_true",
        help="Download and restore the latest backup from Vercel Blob",
    )
    group.add_argument(
        "--list",
        action="store_true",
        help="List all backups available in Vercel Blob",
    )
    group.add_argument(
        "--file",
        type=str,
        help="Path or URL of the backup file (.json or .json.gz) to restore",
    )
    group.add_argument(
        "--backup-now",
        action="store_true",
        help="Create a new database backup immediately and upload to Vercel Blob",
    )

    parser.add_argument(
        "-y",
        "--yes",
        action="store_true",
        help="Skip confirmation prompt",
    )
    parser.add_argument(
        "--token",
        type=str,
        default=None,
        help="Vercel Blob token (overrides BLOB_READ_WRITE_TOKEN env var)",
    )

    args = parser.parse_args()

    if args.backup_now:
        cmd_args = []
        if args.token:
            cmd_args.extend(["--token", args.token])
        call_command("backup_db", *cmd_args)
    else:
        cmd_args = []
        if args.latest:
            cmd_args.append("--latest")
        if args.list:
            cmd_args.append("--list")
        if args.file:
            cmd_args.extend(["--file", args.file])
        if args.yes:
            cmd_args.append("-y")
        if args.token:
            cmd_args.extend(["--token", args.token])

        call_command("restore_db", *cmd_args)


if __name__ == "__main__":
    main()
