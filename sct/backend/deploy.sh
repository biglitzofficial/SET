#!/bin/bash

# Sri Chendur Traders Backend - Cloud Run Deployment Script
# Usage: ./deploy.sh [PROJECT_ID] [REGION]

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Default values
PROJECT_ID=${1:-""}
REGION=${2:-"us-central1"}
SERVICE_NAME="sri-chendur-traders-backend"

echo -e "${GREEN}🚀 Sri Chendur Traders Backend - Cloud Run Deployment${NC}"
echo "=================================================="

# Check if PROJECT_ID is provided
if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}❌ Error: PROJECT_ID is required${NC}"
    echo "Usage: ./deploy.sh PROJECT_ID [REGION]"
    echo "Example: ./deploy.sh my-project-id us-central1"
    exit 1
fi

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ Error: gcloud CLI is not installed${NC}"
    echo "Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set the project
echo -e "${YELLOW}📦 Setting project: $PROJECT_ID${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo -e "${YELLOW}🔧 Enabling required APIs...${NC}"
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com

# Check if secrets exist
echo -e "${YELLOW}🔐 Checking secrets...${NC}"
REQUIRED_SECRETS=("firebase-service-account" "jwt-secret" "sendgrid-api-key" "client-url")
MISSING_SECRETS=()

for secret in "${REQUIRED_SECRETS[@]}"; do
    if ! gcloud secrets describe $secret &> /dev/null; then
        MISSING_SECRETS+=($secret)
    fi
done

if [ ${#MISSING_SECRETS[@]} -ne 0 ]; then
    echo -e "${RED}❌ Missing secrets: ${MISSING_SECRETS[*]}${NC}"
    echo "Please create these secrets first. See CLOUD_RUN_DEPLOYMENT.md for instructions."
    exit 1
fi

echo -e "${GREEN}✅ All required secrets found${NC}"

# Deploy to Cloud Run
echo -e "${YELLOW}🚀 Deploying to Cloud Run...${NC}"
gcloud run deploy $SERVICE_NAME \
  --source . \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --timeout 300 \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "FIREBASE_SERVICE_ACCOUNT=firebase-service-account:latest,JWT_SECRET=jwt-secret:latest,SENDGRID_API_KEY=sendgrid-api-key:latest,CLIENT_URL=client-url:latest"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)')

echo ""
echo -e "${GREEN}✅ Deployment successful!${NC}"
echo "=================================================="
echo -e "${GREEN}Service URL: $SERVICE_URL${NC}"
echo ""
echo "Test your deployment:"
echo "  curl $SERVICE_URL/api/health"
echo ""
echo "View logs:"
echo "  gcloud run services logs tail $SERVICE_NAME --region $REGION"
echo ""
echo "Update your frontend API URL to:"
echo "  $SERVICE_URL"
echo "=================================================="
