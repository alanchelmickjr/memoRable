#!/bin/bash
# Bootstrap Terraform backend for MemoRable
# Creates S3 bucket and DynamoDB table for state management
# Run: ./scripts/terraform-bootstrap.sh [staging|production]

set -e

REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${1:-staging}"
BUCKET_NAME="memorable-terraform-state-${ENVIRONMENT}"
TABLE_NAME="memorable-terraform-locks-${ENVIRONMENT}"

echo "========================================="
echo "Terraform Backend Bootstrap - ${ENVIRONMENT}"
echo "========================================="
echo ""

# Check prerequisites
command -v aws >/dev/null 2>&1 || { echo "AWS CLI required but not installed." >&2; exit 1; }

echo "1. Creating S3 bucket for Terraform state..."
if aws s3api head-bucket --bucket "${BUCKET_NAME}" 2>/dev/null; then
  echo "   Bucket ${BUCKET_NAME} already exists"
else
  aws s3api create-bucket \
    --bucket "${BUCKET_NAME}" \
    --region "${REGION}" \
    $(if [ "${REGION}" != "us-east-1" ]; then echo "--create-bucket-configuration LocationConstraint=${REGION}"; fi)

  aws s3api put-bucket-versioning \
    --bucket "${BUCKET_NAME}" \
    --versioning-configuration Status=Enabled

  aws s3api put-bucket-encryption \
    --bucket "${BUCKET_NAME}" \
    --server-side-encryption-configuration '{
      "Rules": [{
        "ApplyServerSideEncryptionByDefault": {
          "SSEAlgorithm": "AES256"
        },
        "BucketKeyEnabled": true
      }]
    }'

  aws s3api put-public-access-block \
    --bucket "${BUCKET_NAME}" \
    --public-access-block-configuration '{
      "BlockPublicAcls": true,
      "IgnorePublicAcls": true,
      "BlockPublicPolicy": true,
      "RestrictPublicBuckets": true
    }'

  echo "   Created bucket ${BUCKET_NAME}"
fi

echo "2. Creating DynamoDB table for state locking..."
if aws dynamodb describe-table --table-name "${TABLE_NAME}" --region "${REGION}" 2>/dev/null; then
  echo "   Table ${TABLE_NAME} already exists"
else
  aws dynamodb create-table \
    --table-name "${TABLE_NAME}" \
    --attribute-definitions AttributeName=LockID,AttributeType=S \
    --key-schema AttributeName=LockID,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --region "${REGION}"

  echo "   Created table ${TABLE_NAME}"
fi

echo ""
echo "========================================="
echo "Bootstrap Complete!"
echo "========================================="
echo ""
echo "S3 Bucket: ${BUCKET_NAME}"
echo "DynamoDB Table: ${TABLE_NAME}"
echo ""
echo "You can now run:"
echo "  cd terraform"
echo "  terraform init -backend-config=\"bucket=${BUCKET_NAME}\""
echo "  terraform plan -var-file=\"environments/${ENVIRONMENT}.tfvars\""
echo ""
