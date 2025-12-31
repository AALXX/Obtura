pipeline {
    agent any

    environment {
        COMPOSE_FILE = "docker-compose.test.yml"

        GOOGLE_CLIENT_ID       = credentials('google-client-id')
        GOOGLE_CLIENT_SECRET   = credentials('google-client-secret')
        EMAIL_USERNAME         = credentials('email-username')
        EMAIL_PASS             = credentials('email-password')
        POSTGRESQL_PASSWORD    = credentials('postgres-password')
        AUTH_SECRET            = credentials('auth-secret')
        CHANGE_GMAIL_SECRET    = credentials('change-gmail-secret')
        TEAM_INVITATION_SECRET = credentials('team-invitation-secret')
        ENV_ENCRYPTION_KEY     = credentials('env-encryption-key')

        RABBITMQ_USER          = credentials('rabbitmq-user')
        RABBITMQ_PASSWORD      = credentials('rabbitmq-password')

        MINIO_ROOT_USER        = credentials('minio-root-user')
        MINIO_ROOT_PASSWORD    = credentials('minio-root-pass')

        REGISTRY_USERNAME      = credentials('registry-username')
        REGISTRY_PASSWORD      = credentials('registry-password')
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Generate docker-compose.test.yml') {
            steps {
                sh '''
cat > docker-compose.test.yml <<EOF
version: "3.8"

networks:
  obtura_dev:
    driver: bridge

services:
  traefik:
    image: traefik:v3
    container_name: obtura-traefik
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entryPoints.web.address=:80
      - --api.insecure=true
      - --log.level=INFO
    ports:
      - "80:80"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./infra/traefik/traefik.yml:/etc/traefik/traefik.yml:ro
    networks:
      - obtura_dev

  frontend:
    build:
      context: ./client-layer/client
      dockerfile: Dockerfile.dev
    container_name: obtura-frontend
    labels:
      - traefik.enable=true
      - traefik.http.routers.frontend.rule=PathPrefix(`/`) && Host(`localhost`)
      - traefik.http.routers.frontend.entrypoints=web
      - traefik.http.routers.frontend.priority=10
    ports:
      - "3000:3000"
    volumes:
      - ./client-layer/client:/app
      - /app/node_modules
    environment:
      NODE_ENV: development
      BACKEND_URL: http://traefik/backend
      NEXT_PUBLIC_BACKEND_URL: http://localhost/backend
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      NEXTAUTH_URL: http://localhost
      AUTH_SECRET: ${AUTH_SECRET}
      CHANGE_GMAIL_SECRET: ${CHANGE_GMAIL_SECRET}
      TEAM_INVITATION_SECRET: ${TEAM_INVITATION_SECRET}
    depends_on:
      - traefik
    networks:
      - obtura_dev

  core-api:
    build:
      context: ./api-layer/core-api
      dockerfile: Dockerfile.dev
    container_name: obtura-core-api
    labels:
      - traefik.enable=true
      - traefik.http.routers.core-api.rule=PathPrefix(\`/backend\`)
      - traefik.http.routers.core-api.entrypoints=web
      - traefik.http.routers.core-api.priority=20
      - traefik.http.middlewares.strip-backend.stripprefix.prefixes=/backend
      - traefik.http.routers.core-api.middlewares=strip-backend
    ports:
      - "7070:7070"
    volumes:
      - ./api-layer/core-api:/app
      - /app/node_modules
    environment:
      NODE_ENV: development
      ENV_ENCRYPTION_KEY: ${ENV_ENCRYPTION_KEY}
      POSTGRESQL_HOST: postgres
      POSTGRESQL_PORT: 5432
      POSTGRESQL_DATABASE: obtura_db
      POSTGRESQL_USER: alx
      POSTGRESQL_PASSWORD: ${POSTGRESQL_PASSWORD}
      REDIS_URL: redis://redis:6379
      RABBITMQ_PROTOCOL: amqp
      RABBITMQ_HOST: rabbitmq
      RABBITMQ_PORT: 5672
      RABBITMQ_USER: ${RABBITMQ_USER}
      RABBITMQ_PASSWORD: ${RABBITMQ_PASSWORD}
      ACCOUNT_SECRET: ${AUTH_SECRET}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      FRONTEND_URL: http://localhost
      EMAIL_USERNAME: ${EMAIL_USERNAME}
      EMAIL_PASS: ${EMAIL_PASS}
      CHANGE_GMAIL_SECRET: ${CHANGE_GMAIL_SECRET}
      TEAM_INVITATION_SECRET: ${TEAM_INVITATION_SECRET}
    depends_on:
      rabbitmq:
        condition: service_healthy
      postgres:
        condition: service_started
      redis:
        condition: service_started
      traefik:
        condition: service_started
    restart: unless-stopped
    networks:
      - obtura_dev

  postgres:
    image: postgres:18-alpine
    container_name: obtura-postgres
    environment:
      POSTGRES_USER: alx
      POSTGRES_PASSWORD: ${POSTGRESQL_PASSWORD}
      POSTGRES_DB: obtura_db
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U alx -d obtura_db"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - obtura_dev

  redis:
    image: redis:7-alpine
    container_name: obtura-redis
    restart: unless-stopped
    networks:
      - obtura_dev

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    container_name: obtura-rabbitmq
    environment:
      RABBITMQ_DEFAULT_USER: ${RABBITMQ_USER}
      RABBITMQ_DEFAULT_PASS: ${RABBITMQ_PASSWORD}
    healthcheck:
      test: rabbitmq-diagnostics -q ping
      interval: 10s
      retries: 5
    restart: unless-stopped
    networks:
      - obtura_dev

  minio:
    image: minio/minio:latest
    container_name: obtura-minio
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD}
    command: server /data --console-address ":9001"
    restart: unless-stopped
    networks:
      - obtura_dev

volumes:
  postgres_data:
  redis_data:
  rabbitmq_data:
  minio_data:
EOF
                '''
            }
        }

        stage('Docker Build') {
            steps {
                sh "docker compose -f ${COMPOSE_FILE} build --no-cache"
            }
        }

        stage('Deploy Stack') {
            steps {
                sh """
                  docker compose -f ${COMPOSE_FILE} down
                  docker compose -f ${COMPOSE_FILE} up -d
                """
            }
        }
    }

    post {
        success {
            echo "✔ Test environment deployed successfully."
        }
        failure {
            echo "❌ Deployment failed — check logs."
        }
    }
}
