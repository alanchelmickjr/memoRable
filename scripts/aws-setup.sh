#!/bin/bash
# AWS Infrastructure Setup for MemoRable
# Run: ./scripts/aws-setup.sh
#
# Prerequisites:
# - AWS CLI configured with appropriate credentials
# - Docker installed
# - jq installed (for JSON parsing)

set -e

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${1:-staging}"
CLUSTER_NAME="memorable-${ENVIRONMENT}"
SERVICE_NAME="memorable-${ENVIRONMENT}"
ECR_REPO="memorable"

echo "========================================="
echo "MemoRable AWS Setup - ${ENVIRONMENT}"
echo "========================================="
echo ""

# Check prerequisites
command -v aws >/dev/null 2>&1 || { echo "AWS CLI required but not installed. Aborting." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "Docker required but not installed. Aborting." >&2; exit 1; }

echo "1. Creating ECR Repository..."
aws ecr describe-repositories --repository-names ${ECR_REPO} --region ${REGION} 2>/dev/null || \
  aws ecr create-repository --repository-name ${ECR_REPO} --region ${REGION}

aws ecr describe-repositories --repository-names ${ECR_REPO}-mcp --region ${REGION} 2>/dev/null || \
  aws ecr create-repository --repository-name ${ECR_REPO}-mcp --region ${REGION}

echo "2. Creating ECS Cluster..."
aws ecs describe-clusters --clusters ${CLUSTER_NAME} --region ${REGION} | grep -q "ACTIVE" || \
  aws ecs create-cluster --cluster-name ${CLUSTER_NAME} --region ${REGION} \
    --capacity-providers FARGATE FARGATE_SPOT \
    --default-capacity-provider-strategy capacityProvider=FARGATE,weight=1

echo "3. Creating Secrets in Secrets Manager..."
# Check if secrets exist, create if not
aws secretsmanager describe-secret --secret-id memorable/${ENVIRONMENT}/mongodb --region ${REGION} 2>/dev/null || \
  aws secretsmanager create-secret \
    --name memorable/${ENVIRONMENT}/mongodb \
    --description "MongoDB credentials for MemoRable ${ENVIRONMENT}" \
    --secret-string '{"username":"memorable_user","password":"CHANGE_ME_'$(openssl rand -hex 16)'"}' \
    --region ${REGION}

aws secretsmanager describe-secret --secret-id memorable/${ENVIRONMENT}/anthropic --region ${REGION} 2>/dev/null || \
  aws secretsmanager create-secret \
    --name memorable/${ENVIRONMENT}/anthropic \
    --description "Anthropic API key for MemoRable ${ENVIRONMENT}" \
    --secret-string '{"api_key":"sk-ant-PASTE_YOUR_KEY_HERE"}' \
    --region ${REGION}

echo "4. Creating Task Execution Role..."
cat > /tmp/trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF

aws iam get-role --role-name memorable-task-execution-role 2>/dev/null || \
  aws iam create-role \
    --role-name memorable-task-execution-role \
    --assume-role-policy-document file:///tmp/trust-policy.json

aws iam attach-role-policy \
  --role-name memorable-task-execution-role \
  --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# Add secrets access
cat > /tmp/secrets-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": [
        "arn:aws:secretsmanager:${REGION}:*:secret:memorable/${ENVIRONMENT}/*"
      ]
    }
  ]
}
EOF

aws iam put-role-policy \
  --role-name memorable-task-execution-role \
  --policy-name memorable-secrets-access \
  --policy-document file:///tmp/secrets-policy.json

echo "5. Creating Task Definition..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

cat > /tmp/task-definition.json << EOF
{
  "family": "memorable-${ENVIRONMENT}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "1024",
  "memory": "2048",
  "executionRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/memorable-task-execution-role",
  "taskRoleArn": "arn:aws:iam::${ACCOUNT_ID}:role/memorable-task-execution-role",
  "containerDefinitions": [
    {
      "name": "memorable-app",
      "image": "${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "${ENVIRONMENT}"},
        {"name": "PORT", "value": "3000"}
      ],
      "secrets": [
        {
          "name": "MONGODB_URI",
          "valueFrom": "arn:aws:secretsmanager:${REGION}:${ACCOUNT_ID}:secret:memorable/${ENVIRONMENT}/mongodb"
        },
        {
          "name": "ANTHROPIC_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:${REGION}:${ACCOUNT_ID}:secret:memorable/${ENVIRONMENT}/anthropic"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/memorable-${ENVIRONMENT}",
          "awslogs-region": "${REGION}",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/health/live || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
EOF

aws ecs register-task-definition --cli-input-json file:///tmp/task-definition.json --region ${REGION}

echo "6. Creating CloudWatch Log Group..."
aws logs create-log-group --log-group-name /ecs/memorable-${ENVIRONMENT} --region ${REGION} 2>/dev/null || true

echo ""
echo "========================================="
echo "Setup Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Update secrets in AWS Secrets Manager:"
echo "   aws secretsmanager update-secret --secret-id memorable/${ENVIRONMENT}/anthropic --secret-string '{\"api_key\":\"YOUR_ACTUAL_KEY\"}'"
echo ""
echo "2. Create VPC, Subnets, and Security Groups (or use existing)"
echo ""
echo "3. Create DocumentDB or MongoDB Atlas cluster"
echo ""
echo "4. Create ECS Service:"
echo "   aws ecs create-service --cluster ${CLUSTER_NAME} --service-name ${SERVICE_NAME} \\"
echo "     --task-definition memorable-${ENVIRONMENT} --desired-count 1 --launch-type FARGATE \\"
echo "     --network-configuration 'awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=ENABLED}'"
echo ""
echo "5. Push Docker image:"
echo "   aws ecr get-login-password | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com"
echo "   docker build -t memorable -f docker/Dockerfile ."
echo "   docker tag memorable:latest ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:latest"
echo "   docker push ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}:latest"
echo ""
echo "Or just push to main and let GitHub Actions handle it!"
