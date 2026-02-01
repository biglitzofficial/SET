@echo off
REM Sri Chendur Traders Backend - Cloud Run Deployment Script (Windows)
REM Usage: deploy.bat [PROJECT_ID] [REGION]

setlocal enabledelayedexpansion

set PROJECT_ID=%1
set REGION=%2
if "%REGION%"=="" set REGION=us-central1
set SERVICE_NAME=sri-chendur-traders-backend

echo ================================
echo Sri Chendur Traders Backend
echo Cloud Run Deployment
echo ================================
echo.

REM Check if PROJECT_ID is provided
if "%PROJECT_ID%"=="" (
    echo ERROR: PROJECT_ID is required
    echo Usage: deploy.bat PROJECT_ID [REGION]
    echo Example: deploy.bat my-project-id us-central1
    exit /b 1
)

REM Check if gcloud is installed
where gcloud >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: gcloud CLI is not installed
    echo Please install it from: https://cloud.google.com/sdk/docs/install
    exit /b 1
)

REM Set the project
echo Setting project: %PROJECT_ID%
call gcloud config set project %PROJECT_ID%

REM Enable required APIs
echo Enabling required APIs...
call gcloud services enable run.googleapis.com
call gcloud services enable cloudbuild.googleapis.com
call gcloud services enable containerregistry.googleapis.com
call gcloud services enable secretmanager.googleapis.com

REM Check if secrets exist
echo Checking secrets...
set MISSING_SECRETS=

gcloud secrets describe firebase-service-account >nul 2>nul || set MISSING_SECRETS=!MISSING_SECRETS! firebase-service-account
gcloud secrets describe jwt-secret >nul 2>nul || set MISSING_SECRETS=!MISSING_SECRETS! jwt-secret
gcloud secrets describe sendgrid-api-key >nul 2>nul || set MISSING_SECRETS=!MISSING_SECRETS! sendgrid-api-key
gcloud secrets describe client-url >nul 2>nul || set MISSING_SECRETS=!MISSING_SECRETS! client-url

if not "!MISSING_SECRETS!"=="" (
    echo ERROR: Missing secrets:!MISSING_SECRETS!
    echo Please create these secrets first. See CLOUD_RUN_DEPLOYMENT.md for instructions.
    exit /b 1
)

echo All required secrets found!

REM Deploy to Cloud Run
echo Deploying to Cloud Run...
call gcloud run deploy %SERVICE_NAME% ^
  --source . ^
  --platform managed ^
  --region %REGION% ^
  --allow-unauthenticated ^
  --port 8080 ^
  --memory 512Mi ^
  --cpu 1 ^
  --min-instances 0 ^
  --max-instances 10 ^
  --timeout 300 ^
  --set-env-vars "NODE_ENV=production" ^
  --set-secrets "FIREBASE_SERVICE_ACCOUNT=firebase-service-account:latest,JWT_SECRET=jwt-secret:latest,SENDGRID_API_KEY=sendgrid-api-key:latest,CLIENT_URL=client-url:latest"

if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Deployment failed
    exit /b 1
)

REM Get the service URL
for /f "tokens=*" %%i in ('gcloud run services describe %SERVICE_NAME% --platform managed --region %REGION% --format "value(status.url)"') do set SERVICE_URL=%%i

echo.
echo ================================
echo Deployment successful!
echo ================================
echo Service URL: %SERVICE_URL%
echo.
echo Test your deployment:
echo   curl %SERVICE_URL%/api/health
echo.
echo View logs:
echo   gcloud run services logs tail %SERVICE_NAME% --region %REGION%
echo.
echo Update your frontend API URL to:
echo   %SERVICE_URL%
echo ================================
