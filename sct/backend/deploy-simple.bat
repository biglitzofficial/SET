@echo off
echo ================================
echo Backend Deployment to Cloud Run
echo ================================

REM Build and deploy using gcloud
gcloud run deploy sri-chendur-traders-backend ^
  --source . ^
  --region=us-central1 ^
  --allow-unauthenticated ^
  --platform=managed ^
  --project=sri-chendur-traders

echo.
echo Backend deployed successfully!
echo URL: https://sri-chendur-traders-backend-13351890542.us-central1.run.app
