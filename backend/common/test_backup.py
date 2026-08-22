import gzip
import json
import tempfile
from unittest.mock import MagicMock, patch
from django.test import TestCase
from django.core.management import call_command
from common.backup import (
    create_database_backup,
    dump_database_to_gzip_bytes,
    restore_database_from_file,
    prune_older_blob_backups,
)
from users.models import User
from common.models import Organization


class BackupRestoreTests(TestCase):
    def setUp(self):
        self.org = Organization.objects.create(name="Backup Test Org")
        self.user = User.objects.create_user(
            username="backuptestuser",
            email="backup@example.com",
            password="StrongPassword123!",
            organization=self.org,
        )

    def test_dump_database_to_gzip_bytes(self):
        compressed_data = dump_database_to_gzip_bytes()
        self.assertIsInstance(compressed_data, bytes)
        self.assertGreater(len(compressed_data), 0)

        decompressed = gzip.decompress(compressed_data).decode("utf-8")
        data = json.loads(decompressed)
        self.assertIsInstance(data, list)
        # Verify user is present in dump
        usernames = [item["fields"].get("username") for item in data if item["model"] == "users.user"]
        self.assertIn("backuptestuser", usernames)

    def test_create_database_backup_local(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            result = create_database_backup(local_path=tmpdir, upload_to_blob=False)
            self.assertIsNotNone(result.get("saved_local"))
            self.assertTrue(result["filename"].endswith(".json.gz"))
            self.assertGreater(result["size_bytes"], 0)

    def test_blob_backup_requires_token(self):
        with patch.dict("os.environ", {}, clear=True):
            with self.assertRaisesRegex(ValueError, "BLOB_READ_WRITE_TOKEN"):
                create_database_backup(upload_to_blob=True)

    @patch("common.backup.blob.put")
    @patch("common.backup.blob.list_objects")
    def test_create_database_backup_blob(self, mock_list, mock_put):
        mock_put.return_value = {
            "url": "https://blob.vercel.com/db_backups/test.json.gz",
            "pathname": "db_backups/test.json.gz",
        }
        mock_list.return_value = {"blobs": []}

        result = create_database_backup(upload_to_blob=True, token="fake_token_123")
        self.assertEqual(result.get("blob_url"), "https://blob.vercel.com/db_backups/test.json.gz")
        self.assertEqual(result.get("blob_pathname"), "db_backups/test.json.gz")
        mock_put.assert_called_once()
        self.assertEqual(mock_put.call_args.kwargs["access"], "private")

    @patch("common.backup.blob.delete")
    @patch("common.backup.blob.list_objects")
    def test_prune_older_blob_backups(self, mock_list, mock_delete):
        mock_list.return_value = {
            "blobs": [
                {"pathname": f"db_backups/backup_{i}.json.gz", "url": f"https://blob.com/{i}", "uploaded_at": f"2026-08-{i:02d}"}
                for i in range(1, 20)
            ]
        }
        deleted_count = prune_older_blob_backups(keep_count=14, token="fake_token")
        self.assertEqual(deleted_count, 5)
        mock_delete.assert_called_once()

    def test_restore_database_from_file(self):
        compressed_data = dump_database_to_gzip_bytes()
        with tempfile.NamedTemporaryFile("wb", suffix=".json.gz", delete=False) as f:
            f.write(compressed_data)
            tmp_path = f.name

        # Delete user in DB
        self.user.delete()
        self.assertFalse(User.objects.filter(username="backuptestuser").exists())

        # Restore from file
        res = restore_database_from_file(tmp_path)
        self.assertTrue(res.get("success"))

        # Verify user is restored
        self.assertTrue(User.objects.filter(username="backuptestuser").exists())

    def test_backup_db_management_command(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            call_command("backup_db", "--local-only", "--output", tmpdir)
            import os
            files = os.listdir(tmpdir)
            self.assertTrue(any(f.endswith(".json.gz") for f in files))
