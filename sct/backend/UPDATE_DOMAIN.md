# Update Backend for Custom Domain: sct.biglitz.in

## Update Cloud Run Environment Variable

Run this command to update the CLIENT_URL environment variable in Google Cloud Run:

```bash
gcloud run services update sri-chendur-traders-backend \
  --region=us-central1 \
  --update-env-vars CLIENT_URL=https://sct.biglitz.in
```

Or update through Google Cloud Console:

1. Go to: https://console.cloud.google.com/run
2. Select your service: `sri-chendur-traders-backend`
3. Click **"EDIT & DEPLOY NEW REVISION"**
4. Go to **Variables & Secrets** tab
5. Update `CLIENT_URL` to: `https://sct.biglitz.in`
6. Click **"DEPLOY"**

## Update Secret Manager (if using secrets)

If CLIENT_URL is stored in Secret Manager:

```bash
echo -n "https://sct.biglitz.in" | gcloud secrets versions add client-url --data-file=-
```

## Verify CORS Configuration

After updating, test the CORS headers:

```bash
curl -I -X OPTIONS https://sri-chendur-traders-backend-13351890542.us-central1.run.app/api/customers \
  -H "Origin: https://sct.biglitz.in" \
  -H "Access-Control-Request-Method: GET"
```

You should see:

```
Access-Control-Allow-Origin: https://sct.biglitz.in
Access-Control-Allow-Credentials: true
```

## Multiple Origins (Optional)

If you want to allow both domains during transition, update server.js to accept multiple origins:

```javascript
const allowedOrigins = [
  "http://localhost:3000",
  "https://sri-chendur-traders.web.app",
  "https://sct.biglitz.in",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  }),
);
```
