# PostgreSQL

This directory contains database initialization scripts and configuration.

## HTTP Metrics Tables

See `data-layer/log/http_metrics.sql` for the full schema definition.

### Table Retention Policies

| Table | Retention Period | Purpose |
|-------|-----------------|---------|
| `http_metrics_minute` | 30 days | Minute-level HTTP metrics aggregates |
| `http_requests_sampled` | 7 days | Sampled raw requests (1% sample rate) |
| `geo_distribution` | 30 days | Geographic distribution data |
| `status_code_distribution` | 30 days | Status code breakdowns |
| `latency_buckets` | 30 days | Latency histogram data |
| `endpoint_stats` | 90 days | Daily endpoint statistics |

## Cleanup Strategy

Cleanup is handled by the **monitoring-service** application, not by pg_cron.

### Automated Cleanup

The monitoring service runs a scheduled cleanup job that executes daily at 02:00 AM:

- Deletes records older than retention period
- Runs VACUUM ANALYZE to reclaim space and update statistics
- Logs cleanup activity

### Manual Cleanup

You can also run cleanup manually using the CLI tool:

```bash
# SSH into monitoring service container
docker exec -it obtura-monitoring-service sh

# Run full cleanup
go run cmd/cleanup/main.go

# Dry run (show what would be deleted)
go run cmd/cleanup/main.go -dry-run

# Clean specific table
go run cmd/cleanup/main.go -table http_metrics_minute

# Vacuum only
go run cmd/cleanup/main.go -vacuum
```

### SQL Helper Functions

```sql
-- Count records that would be deleted
SELECT * FROM count_old_records_to_clean();

-- Check table sizes
SELECT * FROM get_metrics_table_sizes();
```

## Configuration

The PostgreSQL service is configured in `docker-compose.dev.yml`:

```yaml
postgres:
  image: postgres:18-alpine
  environment:
    - POSTGRES_USER=alx
    - POSTGRES_PASSWORD=serbvn
    - POSTGRES_DB=obtura_db
```

## Backup and Restore

```bash
# Backup
docker exec obtura-postgres pg_dump -U alx -d obtura_db > backup.sql

# Restore
docker exec -i obtura-postgres psql -U alx -d obtura_db < backup.sql
```