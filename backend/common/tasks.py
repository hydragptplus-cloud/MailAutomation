import logging
from celery import shared_task
from .backup import create_database_backup

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def auto_backup_database_task(self):
    """
    Automated Celery Beat task that dumps the database, compresses it,
    and uploads it to Vercel Blob while pruning older backups.
    """
    logger.info("Starting automated database backup task...")
    try:
        result = create_database_backup(upload_to_blob=True, retention_count=14)
        logger.info(f"Automated database backup completed successfully: {result.get('filename')} (Blob: {result.get('blob_pathname')})")
        return result
    except Exception as exc:
        logger.error(f"Automated database backup task failed: {exc}")
        raise self.retry(exc=exc)
