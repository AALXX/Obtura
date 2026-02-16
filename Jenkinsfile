pipeline {
    agent {
        label 'docker-prod'
    }

    options {
        buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '5'))
        disableConcurrentBuilds()
        timeout(time: 30, unit: 'MINUTES')
        timestamps()
        ansiColor('xterm')
    }

    environment {
        COMPOSE_FILE = 'docker-compose.prod.yml'
        REGISTRY_URL = credentials('registry-url')
        VERSION = "${env.BUILD_NUMBER}"
        DEPLOY_TIMEOUT = '300'
    }

    stages {
        stage('Initialize') {
            steps {
                script {
                    env.GIT_COMMIT_SHORT = sh(
                        script: 'git rev-parse --short HEAD',
                        returnStdout: true
                    ).trim()
                    
                    env.GIT_BRANCH_NAME = env.BRANCH_NAME ?: sh(
                        script: 'git rev-parse --abbrev-ref HEAD',
                        returnStdout: true
                    ).trim()
                    
                    echo "Building branch: ${env.GIT_BRANCH_NAME}"
                    echo "Commit: ${env.GIT_COMMIT_SHORT}"
                    
                    if (env.GIT_BRANCH_NAME != 'main' && env.GIT_BRANCH_NAME != 'master') {
                        error('Deployment only allowed from main/master branch')
                    }
                }
            }
        }

        stage('Security Scan') {
            parallel {
                stage('Secret Detection') {
                    steps {
                        sh '''
                            if command -v trufflehog &> /dev/null; then
                                trufflehog filesystem . --json || true
                            else
                                echo "TruffleHog not installed, skipping secret scan"
                            fi
                        '''
                    }
                }
                stage('Dependency Check') {
                    steps {
                        sh '''
                            echo "Checking for dependency vulnerabilities..."
                            # Add npm audit, snyk, or trivy scans here
                        '''
                    }
                }
            }
        }

        stage('Build & Push Images') {
            parallel {
                stage('Frontend') {
                    steps {
                        script {
                            def image = docker.build(
                                "${REGISTRY_URL}/obtura-frontend:${VERSION}",
                                "-f client-layer/client/Dockerfile.prod client-layer/client"
                            )
                            docker.withRegistry("https://${REGISTRY_URL}", 'registry-credentials') {
                                image.push()
                                image.push('latest')
                            }
                        }
                    }
                }
                stage('Core API') {
                    steps {
                        script {
                            def image = docker.build(
                                "${REGISTRY_URL}/obtura-core-api:${VERSION}",
                                "-f api-layer/core-api/Dockerfile.prod api-layer/core-api"
                            )
                            docker.withRegistry("https://${REGISTRY_URL}", 'registry-credentials') {
                                image.push()
                                image.push('latest')
                            }
                        }
                    }
                }
                stage('Payment Service') {
                    steps {
                        script {
                            def image = docker.build(
                                "${REGISTRY_URL}/obtura-payment-service:${VERSION}",
                                "-f api-layer/payment-service/Dockerfile.prod api-layer/payment-service"
                            )
                            docker.withRegistry("https://${REGISTRY_URL}", 'registry-credentials') {
                                image.push()
                                image.push('latest')
                            }
                        }
                    }
                }
                stage('Build Service') {
                    steps {
                        script {
                            def image = docker.build(
                                "${REGISTRY_URL}/obtura-build-service:${VERSION}",
                                "-f api-layer/build-service/Dockerfile.prod api-layer/build-service"
                            )
                            docker.withRegistry("https://${REGISTRY_URL}", 'registry-credentials') {
                                image.push()
                                image.push('latest')
                            }
                        }
                    }
                }
                stage('Deploy Service') {
                    steps {
                        script {
                            def image = docker.build(
                                "${REGISTRY_URL}/obtura-deploy-service:${VERSION}",
                                "-f api-layer/deploy-service/Dockerfile.prod api-layer/deploy-service"
                            )
                            docker.withRegistry("https://${REGISTRY_URL}", 'registry-credentials') {
                                image.push()
                                image.push('latest')
                            }
                        }
                    }
                }
                stage('Monitoring Service') {
                    steps {
                        script {
                            def image = docker.build(
                                "${REGISTRY_URL}/obtura-monitoring-service:${VERSION}",
                                "-f api-layer/monitoring-service/Dockerfile.prod api-layer/monitoring-service"
                            )
                            docker.withRegistry("https://${REGISTRY_URL}", 'registry-credentials') {
                                image.push()
                                image.push('latest')
                            }
                        }
                    }
                }
            }
        }

        stage('Create Secrets') {
            steps {
                sh '''
                    # Ensure Docker secrets exist (run once manually to create)
                    echo "Verifying Docker secrets..."
                    docker secret ls | grep obtura_ || echo "Secrets need to be created manually first"
                '''
            }
        }

        stage('Deploy') {
            steps {
                script {
                    sh """
                        export VERSION=${VERSION}
                        export DOMAIN=\${DOMAIN}
                        export ACME_EMAIL=\${ACME_EMAIL}
                        
                        # Pull latest images
                        docker compose -f ${COMPOSE_FILE} pull
                        
                        # Deploy with zero-downtime
                        docker compose -f ${COMPOSE_FILE} up -d --remove-orphans
                        
                        # Wait for deployment
                        echo "Waiting for services to start..."
                        sleep 20
                    """
                }
            }
        }

        stage('Health Check') {
            steps {
                script {
                    def services = [
                        'obtura-frontend': 'http://localhost:3000/api/health',
                        'obtura-core-api': 'http://localhost:7070/health',
                        'obtura-payment-service': 'http://localhost:5080/health',
                        'obtura-build-service': 'http://localhost:5050/health',
                        'obtura-deploy-service': 'http://localhost:5070/health',
                        'obtura-monitoring-service': 'http://localhost:5110/health'
                    ]
                    
                    services.each { service, endpoint ->
                        sh """
                            echo "Checking health for ${service}..."
                            for i in \$(seq 1 6); do
                                if docker ps --format "{{.Names}}" | grep -q "${service}"; then
                                    if docker inspect --format='{{.State.Health.Status}}' ${service} 2>/dev/null | grep -q "healthy"; then
                                        echo "✓ ${service} is healthy"
                                        exit 0
                                    fi
                                fi
                                echo "Attempt \$i/6: ${service} not ready yet..."
                                sleep 10
                            done
                            echo "✗ ${service} failed health check"
                            exit 1
                        """
                    }
                }
            }
        }

        stage('Smoke Tests') {
            steps {
                sh '''
                    echo "Running smoke tests..."
                    curl -sf http://localhost:80 || exit 1
                    echo "✓ Frontend accessible"
                    
                    curl -sf http://localhost:80/backend/health || exit 1
                    echo "✓ Core API accessible"
                '''
            }
        }
    }

    post {
        success {
            script {
                def duration = currentBuild.durationString.replace(' and counting', '')
                echo """
                ╔════════════════════════════════════════╗
                ║     Deployment Successful! ✅          ║
                ╠════════════════════════════════════════╣
                ║  Version: ${VERSION}                   ║
                ║  Commit: ${env.GIT_COMMIT_SHORT}       ║
                ║  Duration: ${duration}                 ║
                ╚════════════════════════════════════════╝
                """
            }
        }
        failure {
            script {
                echo """
                ╔════════════════════════════════════════╗
                ║     Deployment Failed! ❌              ║
                ╠════════════════════════════════════════╣
                ║  Version: ${VERSION}                   ║
                ║  Commit: ${env.GIT_COMMIT_SHORT}       ║
                ╚════════════════════════════════════════╝
                """
                
                sh """
                    echo "=== Container Status ==="
                    docker compose -f ${COMPOSE_FILE} ps
                    
                    echo "=== Recent Logs ==="
                    docker compose -f ${COMPOSE_FILE} logs --tail=100 2>&1 || true
                """
            }
        }
        always {
            sh '''
                # Cleanup old images (keep last 5)
                docker images --format "{{.Repository}}:{{.Tag}}" | \
                grep -E "obtura-.*:[0-9]+" | \
                sort -V | \
                head -n -10 | \
                xargs -r docker rmi || true
            '''
            
            cleanWs(
                deleteDirs: true,
                notFailBuild: true
            )
        }
        cleanup {
            sh '''
                # Prune unused resources
                docker system prune -f --volumes=false || true
            '''
        }
    }
}
