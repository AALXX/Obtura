#!/bin/bash

set -e

BACKUP_DIR="/backup/postgres"
RETENTION_DAYS=30
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_NAME="obtura_db"

mkdir -p $BACKUP_DIR

pg_dump -U postgres -h localhost -F c -f "$BACKUP_DIR/full_backup_$TIMESTAMP.dump" $DB_NAME

psql -U postgres -h localhost -d $DB_NAME -t -c "SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'client_%'" | while read schema; do
    if [ ! -z "$schema" ]; then
        pg_dump -U postgres -h localhost -d $DB_NAME -n $schema -F c -f "$BACKUP_DIR/schema_${schema}_$TIMESTAMP.dump"
    fi
done

gzip $BACKUP_DIR/full_backup_$TIMESTAMP.dump

# TODO Upload to off-site storage (Backblaze B2, S3, etc.)
rclone copy $BACKUP_DIR/full_backup_$TIMESTAMP.dump.gz remote:obtura-backups/postgres/

# Clean up old backups (keep last 30 days)
find $BACKUP_DIR -name "*.dump.gz" -mtime +$RETENTION_DAYS -delete

pg_restore --list $BACKUP_DIR/full_backup_$TIMESTAMP.dump.gz > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Backup successful: $TIMESTAMP"
else
    echo "❌ Backup verification failed: $TIMESTAMP"
    # Send alert (via webhook, email, etc.)
    curl -X POST https://your-alerting-system.com/alert \
        -d "Backup verification failed for $TIMESTAMP"
fi