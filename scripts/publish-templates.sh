#!/bin/bash
# Publish CloudFormation templates to S3 for one-click deploy
# Run: ./scripts/publish-templates.sh [bucket-name] [region]
#
# Prerequisites:
# - AWS CLI configured with appropriate credentials
# - S3 bucket created (use cloudformation/template-bucket.yaml)

set -e

# Configuration
BUCKET_NAME="${1:-memorable-cloudformation-templates}"
REGION="${2:-${AWS_REGION:-us-east-1}}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CFN_DIR="${PROJECT_ROOT}/cloudformation"

echo "=============================================="
echo "MemoRable - Publishing CloudFormation Templates"
echo "=============================================="
echo ""
echo "Bucket: ${BUCKET_NAME}"
echo "Region: ${REGION}"
echo ""

# Check prerequisites
command -v aws >/dev/null 2>&1 || { echo "ERROR: AWS CLI required but not installed." >&2; exit 1; }

# Verify bucket exists
echo "1. Verifying S3 bucket exists..."
if ! aws s3api head-bucket --bucket "${BUCKET_NAME}" 2>/dev/null; then
    echo ""
    echo "ERROR: Bucket '${BUCKET_NAME}' does not exist or you don't have access."
    echo ""
    echo "Create the bucket first:"
    echo "  aws cloudformation deploy \\"
    echo "    --template-file cloudformation/template-bucket.yaml \\"
    echo "    --stack-name memorable-template-bucket \\"
    echo "    --parameter-overrides BucketName=${BUCKET_NAME}"
    echo ""
    exit 1
fi

# Validate templates before upload
echo "2. Validating CloudFormation templates..."
for template in "${CFN_DIR}"/*.yaml; do
    if [[ -f "$template" && "$(basename "$template")" != "template-bucket.yaml" ]]; then
        template_name=$(basename "$template")
        echo "   Validating ${template_name}..."
        aws cloudformation validate-template \
            --template-body "file://${template}" \
            --region "${REGION}" > /dev/null
    fi
done
echo "   All templates valid!"

# Upload templates
echo "3. Uploading templates to S3..."
for template in "${CFN_DIR}"/*.yaml; do
    if [[ -f "$template" ]]; then
        template_name=$(basename "$template")
        echo "   Uploading ${template_name}..."
        aws s3 cp "$template" "s3://${BUCKET_NAME}/${template_name}" \
            --region "${REGION}" \
            --content-type "application/x-yaml"
    fi
done

# Get the bucket URL
BUCKET_URL="https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com"

echo ""
echo "=============================================="
echo "Templates Published Successfully!"
echo "=============================================="
echo ""
echo "Template URLs:"
echo "  Main Stack:   ${BUCKET_URL}/memorable-stack.yaml"
echo "  GitHub OIDC:  ${BUCKET_URL}/github-oidc.yaml"
echo ""
echo "One-Click Deploy URLs:"
echo ""
echo "Main Stack:"
echo "  https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateUrl=${BUCKET_URL}/memorable-stack.yaml&stackName=memorable"
echo ""
echo "GitHub OIDC:"
echo "  https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateUrl=${BUCKET_URL}/github-oidc.yaml&stackName=memorable-github-oidc"
echo ""
echo "Update your README.md with these URLs!"
echo ""

# Generate markdown for README
cat << EOF

========== COPY FOR README.md ==========

[![Deploy to AWS](https://img.shields.io/badge/Deploy%20to-AWS-FF9900?style=for-the-badge&logo=amazon-aws&logoColor=white)](https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateUrl=${BUCKET_URL}/memorable-stack.yaml&stackName=memorable)

[![Deploy OIDC](https://img.shields.io/badge/Deploy-GitHub_OIDC-232F3E?style=for-the-badge&logo=amazon-aws)](https://console.aws.amazon.com/cloudformation/home#/stacks/quickcreate?templateUrl=${BUCKET_URL}/github-oidc.yaml&stackName=memorable-github-oidc)

=========================================

EOF
