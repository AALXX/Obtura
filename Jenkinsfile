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
        MINIO_ROOT_USER        = credentials('minio-root-user')
        MINIO_ROOT_PASSWORD    = credentials('minio-root-pass')
    }

    stages {

        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Inject .env') {
            steps {
                sh '''
cat > .env <<EOF
NODE_ENV=development

POSTGRES_USER=alx
POSTGRES_PASSWORD=${POSTGRESQL_PASSWORD}
POSTGRES_DB=obtura_db
POSTGRESQL_HOST=postgres
POSTGRESQL_DATABASE=obtura_db
POSTGRESQL_USER=alx
POSTGRESQL_PASSWORD=${POSTGRESQL_PASSWORD}

REDIS_URL=redis://redis:6379

GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}

EMAIL_USERNAME=${EMAIL_USERNAME}
EMAIL_PASS=${EMAIL_PASS}

AUTH_SECRET=${AUTH_SECRET}
CHANGE_GMAIL_SECRET=${CHANGE_GMAIL_SECRET}

FRONTEND_URL=http://localhost
BACKEND_URL=http://traefik/backend

MINIO_ROOT_USER=${MINIO_ROOT_USER}
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
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
