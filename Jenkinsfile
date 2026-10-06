pipeline { 
    agent any 
    
    environment { 
        AWS_REGION = 'ap-south-1' 
        ECR_REPO = 'expense-tracker' 
    } 
    
    options { 
        disableConcurrentBuilds() 
        buildDiscarder(logRotator(numToKeepStr: '10')) 
    } 
    
    triggers { 
        pollSCM('H/2 * * * *') 
    } 
    
    stages { 
        stage('Checkout') { 
            steps { 
                checkout scm 
            } 
        } 
        
        stage('Test') { 
            steps { 
                dir('app') { 
                    sh 'docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/app -w /app node:24-alpine sh -c "npm ci && npm test"' 
                } 
            } 
        } 
        
        stage('Build') { 
            steps { 
                script { 
                    env.IMAGE_TAG = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim() 
                    env.ACCOUNT_ID = sh(script: 'aws sts get-caller-identity --query Account --output text', returnStdout: true).trim() 
                    env.REGISTRY = "${env.ACCOUNT_ID}.dkr.ecr.${env.AWS_REGION}.amazonaws.com" 
                    env.IMAGE = "${env.REGISTRY}/${env.ECR_REPO}" 
                } 
                dir('app') { 
                    sh 'docker build -t "$IMAGE:$IMAGE_TAG" .' 
                } 
            } 
        } 
        
        stage('Push to ECR') { 
            steps { 
                sh ''' 
                aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$REGISTRY" 
                docker push "$IMAGE:$IMAGE_TAG" 
                ''' 
            } 
        } 
    } 
    
    post { 
        success { 
            echo "Pushed ${env.IMAGE}:${env.IMAGE_TAG}" 
        } 
        always { 
            sh 'docker image prune -f' 
        } 
    } 
}
