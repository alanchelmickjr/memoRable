#!/bin/bash
# gpu-up.sh — Wake the GPU, internalize documents, go back to sleep.
# Usage: ./scripts/gpu-up.sh
#        ./scripts/gpu-up.sh stop
#        ./scripts/gpu-up.sh status

set -euo pipefail

STACK_NAME="${MEMORABLE_GPU_STACK:-memorable-gpu}"
REGION="${AWS_REGION:-us-west-2}"

get_instance_id() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`InstanceId`].OutputValue' \
    --output text 2>/dev/null
}

get_service_url() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$REGION" \
    --query 'Stacks[0].Outputs[?OutputKey==`LoRAServiceURL`].OutputValue' \
    --output text 2>/dev/null
}

wait_for_health() {
  local url="$1/health"
  local max_attempts=60
  local attempt=0
  echo "Waiting for LoRA service..."
  while [ $attempt -lt $max_attempts ]; do
    if curl -s --max-time 5 "$url" 2>/dev/null | grep -q '"loaded"'; then
      echo "LoRA service is UP"
      return 0
    fi
    attempt=$((attempt + 1))
    printf "."
    sleep 5
  done
  echo ""
  echo "Timed out waiting for service. Check: ssh into instance, docker logs memorable-lora"
  return 1
}

case "${1:-start}" in
  start|up)
    INSTANCE_ID=$(get_instance_id)
    if [ -z "$INSTANCE_ID" ]; then
      echo "Stack '$STACK_NAME' not found. Deploy first:"
      echo ""
      echo "  aws cloudformation create-stack \\"
      echo "    --stack-name $STACK_NAME \\"
      echo "    --template-body file://cloudformation/memorable-gpu-spot.yaml \\"
      echo "    --capabilities CAPABILITY_NAMED_IAM \\"
      echo "    --parameters ParameterKey=KeyName,ParameterValue=YOUR_KEY"
      exit 1
    fi

    echo "Starting GPU instance $INSTANCE_ID..."
    aws ec2 start-instances --instance-ids "$INSTANCE_ID" --region "$REGION" > /dev/null

    SERVICE_URL=$(get_service_url)
    wait_for_health "$SERVICE_URL"

    echo ""
    echo "=== GPU LoRA Service Ready ==="
    echo "URL:          $SERVICE_URL"
    echo "Internalize:  $SERVICE_URL/internalize"
    echo "Generate:     $SERVICE_URL/generate"
    echo "Health:       $SERVICE_URL/health"
    echo ""
    echo "Set in your shell:"
    echo "  export LORA_SERVICE_URL=$SERVICE_URL"
    echo ""
    echo "Auto-shutdown: 30min idle. Or run: ./scripts/gpu-up.sh stop"
    ;;

  stop|down)
    INSTANCE_ID=$(get_instance_id)
    echo "Stopping GPU instance $INSTANCE_ID..."
    aws ec2 stop-instances --instance-ids "$INSTANCE_ID" --region "$REGION" > /dev/null
    echo "Stopped. EIP preserved. Run './scripts/gpu-up.sh' to restart."
    ;;

  status)
    INSTANCE_ID=$(get_instance_id)
    if [ -z "$INSTANCE_ID" ]; then
      echo "Stack '$STACK_NAME' not found."
      exit 1
    fi

    STATE=$(aws ec2 describe-instances \
      --instance-ids "$INSTANCE_ID" \
      --region "$REGION" \
      --query 'Reservations[0].Instances[0].State.Name' \
      --output text)

    SERVICE_URL=$(get_service_url)

    echo "Instance: $INSTANCE_ID"
    echo "State:    $STATE"
    echo "URL:      $SERVICE_URL"

    if [ "$STATE" = "running" ]; then
      echo ""
      curl -s "$SERVICE_URL/health" 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "Service not responding yet"
    fi
    ;;

  deploy)
    echo "Deploying GPU spot stack..."
    aws cloudformation create-stack \
      --stack-name "$STACK_NAME" \
      --template-body file://cloudformation/memorable-gpu-spot.yaml \
      --capabilities CAPABILITY_NAMED_IAM \
      --region "$REGION" \
      --parameters \
        ParameterKey=KeyName,ParameterValue="${2:?Usage: gpu-up.sh deploy KEY_NAME [EMAIL]}" \
        ParameterKey=AlertEmail,ParameterValue="${3:-}"

    echo "Deploying... watch with:"
    echo "  aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION"
    ;;

  *)
    echo "Usage: gpu-up.sh [start|stop|status|deploy KEY_NAME [EMAIL]]"
    exit 1
    ;;
esac
