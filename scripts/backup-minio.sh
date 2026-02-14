#!/bin/bash

set -e

BACKUP_DIR="/backup/minio"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=14

mc mirror --preserve minio-local/ $BACKUP_DIR/$TIMESTAMP/

# TODO Upload to off-site storage
rclone sync $BACKUP_DIR/$TIMESTAMP/ remote:obtura-backups/minio/$TIMESTAMP/

find $BACKUP_DIR -maxdepth 1 -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \;

echo "✅ MinIO backup successful: $TIMESTAMP"