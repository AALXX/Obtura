CREATE TABLE
    build_quotas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
        plan_name VARCHAR(50) UNIQUE NOT NULL, -- 'starter', 'team', 'business', 'enterprise'    
        -- Build limits
        max_concurrent_builds INTEGER NOT NULL DEFAULT 1,
        max_build_duration_minutes INTEGER NOT NULL DEFAULT 10,
        max_build_size_mb INTEGER NOT NULL DEFAULT 500,
        -- Usage limits
        max_builds_per_hour INTEGER NOT NULL DEFAULT 5,
        max_builds_per_day INTEGER NOT NULL DEFAULT 20,
        max_builds_per_month INTEGER NOT NULL DEFAULT 100,
        -- Resource limits per build
        cpu_cores INTEGER NOT NULL DEFAULT 1,
        memory_gb INTEGER NOT NULL DEFAULT 1,
        disk_space_gb INTEGER NOT NULL DEFAULT 2,
        network_mbps INTEGER NOT NULL DEFAULT 10,
        -- Additional limits
        max_services INTEGER NOT NULL DEFAULT 2,
        max_image_size_gb INTEGER NOT NULL DEFAULT 1,
        max_build_logs_mb INTEGER NOT NULL DEFAULT 10,
        max_artifact_size_gb INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT NOW (),
        updated_at TIMESTAMP DEFAULT NOW ()
    )

INSERT INTO
    build_quotas (
        plan_name,
        max_concurrent_builds,
        max_build_duration_minutes,
        max_build_size_mb,
        max_builds_per_hour,
        max_builds_per_day,
        max_builds_per_month,
        cpu_cores,
        memory_gb,
        disk_space_gb,
        network_mbps,
        max_services,
        max_image_size_gb,
        max_build_logs_mb,
        max_artifact_size_gb
    )
VALUES
    (
        'starter',
        1,
        15,
        500,
        8,
        30,
        100,
        1,
        2,
        5,
        25,
        3,
        2,
        25,
        5
    ),
    (
        'team',
        3,
        30,
        1024,
        25,
        100,
        500,
        2,
        4,
        10,
        50,
        8,
        5,
        50,
        10
    ),
    (
        'business',
        5,
        45,
        2048,
        50,
        200,
        1000,
        4,
        8,
        25,
        100,
        15,
        10,
        100,
        25
    ),
    (
        'enterprise',
        15,
        120,
        4096,
        100,
        500,
        5000,
        8,
        16,
        100,
        500,
        50,
        25,
        500,
        100
    );

CREATE INDEX idx_build_quotas_plan_name ON build_quotas(plan_name);