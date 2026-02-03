@echo off
REM Quick Backend Deployment Script
REM Run this from the backend folder

echo ================================
echo BACKEND DEPLOYMENT STEPS
echo ================================
echo.

echo OPTION 1: Using gcloud CLI (Recommended)
echo ------------------------------------------
echo Run this command:
echo.
echo gcloud run deploy sri-chendur-traders-backend --source . --region=us-central1 --allow-unauthenticated --platform=managed --project=sri-chendur-traders
echo.
echo.

echo OPTION 2: Using Google Cloud Console
echo --------------------------------------
echo 1. Go to: https://console.cloud.google.com/run?project=sri-chendur-traders
echo 2. Click on "sri-chendur-traders-backend" service
echo 3. Click "EDIT & DEPLOY NEW REVISION"
echo 4. In the "Container" tab:
echo    - Click "SELECT" next to container image URL
echo    - Choose the latest image OR upload new code
echo 5. In "Variables & Secrets" tab:
echo    - Verify CLIENT_URL is set to: https://sct.biglitz.in
echo 6. Click "DEPLOY" at the bottom
echo.
echo.

echo OPTION 3: Using Cloud Build
echo -----------------------------
echo gcloud builds submit --config=cloudbuild.yaml --project=sri-chendur-traders
echo.
echo.

echo ================================
echo CURRENT STATUS
echo ================================
echo Frontend: DEPLOYED ✓
echo Backend: NEEDS DEPLOYMENT
echo.
echo After backend deployment, test at:
echo https://sri-chendur-traders.web.app
echo OR
echo https://sct.biglitz.in (after DNS setup)
echo.

pause
