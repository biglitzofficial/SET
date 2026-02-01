# Google Cloud Run Deployment Guide

This guide will help you deploy the Sri Chendur Traders backend to Google Cloud Run.

## Prerequisites

1. **Google Cloud Account**: Sign up at https://cloud.google.com
2. **Google Cloud SDK**: Install from https://cloud.google.com/sdk/docs/install
3. **Docker**: Install from https://docs.docker.com/get-docker/

## Initial Setup

### 1. Install Google Cloud SDK

```bash
# Verify installation
gcloud --version
```

### 2. Login to Google Cloud

```bash
gcloud auth login
gcloud auth application-default login
```

### 3. Create or Select a Project

```bash
# Create a new project
gcloud projects create YOUR-PROJECT-ID --name="Sri Chendur Traders"

# Or list existing projects
gcloud projects list

# Set the active project
gcloud config set project YOUR-PROJECT-ID
```

### 4. Enable Required APIs

```bash
# Enable Cloud Run API
gcloud services enable run.googleapis.com

# Enable Cloud Build API (for building container images)
gcloud services enable cloudbuild.googleapis.com

# Enable Container Registry API
gcloud services enable containerregistry.googleapis.com

# Enable Secret Manager API (for storing secrets)
gcloud services enable secretmanager.googleapis.com
```

## Setup Environment Variables

### 1. Create Secrets in Secret Manager

```bash
# Firebase service account JSON
gcloud secrets create firebase-service-account \
  --data-file=./firebase-service-account.json

# JWT Secret
echo -n "your-jwt-secret-key-here" | gcloud secrets create jwt-secret --data-file=-

# SendGrid API Key
echo -n "your-sendgrid-api-key" | gcloud secrets create sendgrid-api-key --data-file=-

# Client URL
echo -n "https://your-frontend-url.com" | gcloud secrets create client-url --data-file=-
```

### 2. Grant Cloud Run Access to Secrets

```bash
# Get your project number
PROJECT_NUMBER=$(gcloud projects describe YOUR-PROJECT-ID --format="value(projectNumber)")

# Grant access
gcloud secrets add-iam-policy-binding firebase-service-account \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding jwt-secret \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding sendgrid-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding client-url \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

## Deployment Options

### Option 1: Quick Deploy (Manual)

This is the fastest way to deploy for testing:

```bash
# Navigate to backend directory
cd backend

# Build and deploy in one command
gcloud run deploy sri-chendur-traders-backend \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 5000 \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "FIREBASE_SERVICE_ACCOUNT=firebase-service-account:latest,JWT_SECRET=jwt-secret:latest,SENDGRID_API_KEY=sendgrid-api-key:latest,CLIENT_URL=client-url:latest"
```

### Option 2: Docker Build + Deploy

Build locally and push to Cloud Run:

```bash
# Set project ID
export PROJECT_ID=YOUR-PROJECT-ID

# Configure Docker to use gcloud as credential helper
gcloud auth configure-docker

# Build the image
docker build -t gcr.io/$PROJECT_ID/sri-chendur-traders-backend:v1 .

# Push to Container Registry
docker push gcr.io/$PROJECT_ID/sri-chendur-traders-backend:v1

# Deploy to Cloud Run
gcloud run deploy sri-chendur-traders-backend \
  --image gcr.io/$PROJECT_ID/sri-chendur-traders-backend:v1 \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 5000 \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "FIREBASE_SERVICE_ACCOUNT=firebase-service-account:latest,JWT_SECRET=jwt-secret:latest,SENDGRID_API_KEY=sendgrid-api-key:latest,CLIENT_URL=client-url:latest"
```

### Option 3: Cloud Build (CI/CD)

Use Cloud Build for automated deployments:

```bash
# Submit build to Cloud Build
gcloud builds submit --config cloudbuild.yaml

# Or with substitutions
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=us-central1
```

## Post-Deployment

### 1. Get Service URL

```bash
gcloud run services describe sri-chendur-traders-backend \
  --platform managed \
  --region us-central1 \
  --format 'value(status.url)'
```

### 2. Test the Deployment

```bash
# Get the URL
SERVICE_URL=$(gcloud run services describe sri-chendur-traders-backend --platform managed --region us-central1 --format 'value(status.url)')

# Test health endpoint
curl $SERVICE_URL/api/health

# Test email health endpoint
curl $SERVICE_URL/api/health/email
```

### 3. View Logs

```bash
# View logs in real-time
gcloud run services logs tail sri-chendur-traders-backend \
  --platform managed \
  --region us-central1

# Or view in Cloud Console
# https://console.cloud.google.com/run
```

## Update Environment Variables

```bash
# Update an environment variable
gcloud run services update sri-chendur-traders-backend \
  --region us-central1 \
  --update-env-vars "NODE_ENV=production"

# Add new secret
gcloud run services update sri-chendur-traders-backend \
  --region us-central1 \
  --update-secrets "NEW_SECRET=new-secret:latest"
```

## Configure Custom Domain (Optional)

```bash
# Map a custom domain
gcloud run domain-mappings create \
  --service sri-chendur-traders-backend \
  --domain api.yourdomain.com \
  --region us-central1
```

## Scaling Configuration

```bash
# Configure auto-scaling
gcloud run services update sri-chendur-traders-backend \
  --region us-central1 \
  --min-instances 0 \
  --max-instances 10 \
  --concurrency 80 \
  --cpu 1 \
  --memory 512Mi
```

## Cost Optimization Tips

1. **Set minimum instances to 0** for development (free tier eligible)
2. **Use request-based scaling** to scale down when not in use
3. **Monitor usage** in the Cloud Console
4. **Set up budget alerts** to avoid unexpected charges

## Troubleshooting

### Check Service Status

```bash
gcloud run services describe sri-chendur-traders-backend \
  --platform managed \
  --region us-central1
```

### View Recent Logs

```bash
gcloud run services logs read sri-chendur-traders-backend \
  --platform managed \
  --region us-central1 \
  --limit 50
```

### Test Locally with Same Environment

```bash
# Export secrets locally for testing
gcloud secrets versions access latest --secret="firebase-service-account" > firebase-service-account.json
gcloud secrets versions access latest --secret="jwt-secret" > .env.jwt
gcloud secrets versions access latest --secret="sendgrid-api-key" > .env.sendgrid

# Run Docker container locally
docker run -p 5000:5000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=$(cat .env.jwt) \
  -e SENDGRID_API_KEY=$(cat .env.sendgrid) \
  -e CLIENT_URL=http://localhost:3000 \
  -v $(pwd)/firebase-service-account.json:/app/firebase-service-account.json \
  gcr.io/$PROJECT_ID/sri-chendur-traders-backend:v1
```

## Update Frontend to Use Cloud Run URL

After deployment, update your frontend's API configuration to use the Cloud Run URL:

```typescript
// In your frontend constants or config file
const API_BASE_URL =
  process.env.NODE_ENV === "production"
    ? "https://sri-chendur-traders-backend-XXXXX-uc.a.run.app"
    : "http://localhost:5000";
```

## CI/CD Integration

For automatic deployments on Git push, see the `cloudbuild.yaml` file and set up a Cloud Build trigger in the Google Cloud Console.

## Security Best Practices

1. **Don't commit secrets** to version control
2. **Use Secret Manager** for all sensitive data
3. **Enable Cloud Armor** for DDoS protection
4. **Set up Cloud IAP** for authentication if needed
5. **Review IAM permissions** regularly
6. **Enable VPC Service Controls** for additional security

## Support

For issues or questions:

- Google Cloud Run Documentation: https://cloud.google.com/run/docs
- Firebase Admin SDK: https://firebase.google.com/docs/admin/setup
- Express.js: https://expressjs.com/

---

**Note**: Replace `YOUR-PROJECT-ID` with your actual Google Cloud project ID throughout this guide.
