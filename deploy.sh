#!/usr/bin/env bash
# deploy.sh — Build and deploy Trubaoke to AWS
#
# Usage:
#   ./deploy.sh          # build + push backend image, build + sync frontend
#   ./deploy.sh backend  # backend image only
#   ./deploy.sh frontend # frontend only
#
# Prerequisites:
#   - AWS CLI configured (aws configure or assume role)
#   - Docker installed and running
#   - pulumi CLI authenticated
#   - pulumi stack initialized (cd infra && pulumi stack init dev)
#   - YouTube API key set: pulumi config set --secret youtubeApiKey <KEY>
#     (run this from inside the infra/ directory)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infra"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# Read Pulumi outputs
cd "$INFRA_DIR"
ECR_REPO=$(pulumi stack output ecr_repo_url 2>/dev/null)
S3_BUCKET=$(pulumi stack output frontend_bucket 2>/dev/null)
AWS_REGION=$(aws configure get region 2>/dev/null || echo "us-east-1")

deploy_backend() {
  echo "==> Building backend Docker image..."
  docker build --platform linux/amd64 -t trubaoke-backend "$BACKEND_DIR"

  echo "==> Logging in to ECR..."
  aws ecr get-login-password --region "$AWS_REGION" \
    | docker login --username AWS --password-stdin "$ECR_REPO"

  echo "==> Tagging and pushing image..."
  docker tag trubaoke-backend "$ECR_REPO:latest"
  docker push "$ECR_REPO:latest"

  echo "✓ Backend image pushed → $ECR_REPO:latest"
  echo ""
  echo "  App Runner does not auto-deploy when auto_deployments_enabled=false."
  echo "  Trigger a new deployment via the AWS console or:"
  echo "    aws apprunner start-deployment --service-arn <ARN>"
}

deploy_frontend() {
  echo "==> Building frontend..."
  cd "$FRONTEND_DIR"
  npm ci
  npm run build

  echo "==> Syncing to S3..."
  aws s3 sync dist/ "s3://$S3_BUCKET/" \
    --delete \
    --cache-control "public, max-age=31536000, immutable" \
    --exclude "index.html"

  # index.html must not be cached aggressively (SPA entry point)
  aws s3 cp dist/index.html "s3://$S3_BUCKET/index.html" \
    --cache-control "no-cache, no-store, must-revalidate"

  echo "✓ Frontend deployed → s3://$S3_BUCKET/"
}

TARGET="${1:-all}"

case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all)
    deploy_backend
    deploy_frontend
    echo ""
    FRONTEND_URL=$(cd "$INFRA_DIR" && pulumi stack output frontend_url)
    echo "==> Trubaoke is live at: $FRONTEND_URL"
    ;;
  *)
    echo "Unknown target: $TARGET (use: backend | frontend | all)"
    exit 1
    ;;
esac
