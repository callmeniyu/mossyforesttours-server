# Vercel Deployment Guide

## Problem Fixed

The server was timing out on Vercel because MongoDB wasn't connecting properly in the serverless environment. This has been fixed with proper serverless configuration.

## Changes Made

### 1. Created `vercel.json`

- Configures Vercel to use serverless functions
- Routes all requests through `api/index.ts`

### 2. Created `api/index.ts`

- Entry point for Vercel serverless functions
- Ensures MongoDB connection before handling requests
- Caches connection across invocations

### 3. Updated `src/config/db.ts`

- Added connection caching for serverless functions
- Prevents multiple connection attempts
- Handles connection reuse efficiently

### 4. Updated `src/app.ts`

- Health endpoint now checks actual MongoDB connection status
- Returns proper status codes (503 if database is not connected)

## Important: MongoDB Atlas Configuration

**You MUST whitelist Vercel's IP addresses in MongoDB Atlas:**

1. Go to MongoDB Atlas Dashboard
2. Navigate to Network Access
3. Click "Add IP Address"
4. Select "Allow Access from Anywhere" (0.0.0.0/0)
   - Or add specific Vercel IPs if you prefer more security

**Without this, MongoDB will reject all connections from Vercel!**

## Environment Variables on Vercel

Ensure these environment variables are set in your Vercel project:

1. Go to your Vercel project settings
2. Navigate to "Environment Variables"
3. Add the following (copy from your `.env` file):

```
NODE_ENV=production
MONGO_URI=<your-mongodb-connection-string>
JWT_SECRET=<your-jwt-secret>
CORS_ORIGIN=<your-frontend-url>
CLOUDINARY_CLOUD_NAME=<your-cloudinary-name>
CLOUDINARY_API_KEY=<your-cloudinary-key>
CLOUDINARY_API_SECRET=<your-cloudinary-secret>
STRIPE_SECRET_KEY=<your-stripe-secret>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
BREVO_API_KEY=<your-brevo-key>
BREVO_SENDER_EMAIL=<your-sender-email>
```

## Deployment Steps

### Option 1: Vercel CLI (Recommended)

```bash
# Install Vercel CLI if you haven't
npm i -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

### Option 2: GitHub Integration

1. Push your code to GitHub
2. Import the repository in Vercel
3. Vercel will auto-deploy on every push to main branch

## Testing After Deployment

1. **Test health endpoint:**

   ```bash
   curl https://your-domain.vercel.app/health
   ```

   Should return: `{"status":"ok","database":"connected"}`

2. **Test API endpoints:**
   ```bash
   curl https://your-domain.vercel.app/api/tours
   ```
   Should return tours data (not timeout error)

## Troubleshooting

### Still Getting Timeout Errors?

1. **Check MongoDB Atlas IP Whitelist**

   - Ensure 0.0.0.0/0 is allowed

2. **Check Environment Variables**

   - Verify MONGO_URI is correctly set in Vercel

3. **Check Logs**

   ```bash
   vercel logs
   ```

4. **Test MongoDB Connection String Locally**
   ```bash
   npm run dev
   ```
   Should connect without errors

### Cold Start Issues

First request after inactivity may take longer (10-20 seconds) due to:

- Serverless function cold start
- MongoDB connection establishment

This is normal for serverless deployments.

## Notes

- Schedulers (review emails, timeslots) won't run on Vercel serverless
- Consider using Vercel Cron Jobs or external scheduler if needed
- Connection pooling is maintained between warm invocations
- Each serverless function has 10-second execution limit (Hobby plan)

## Build Command (if needed)

If Vercel asks for build configuration:

- Build Command: `npm run build`
- Output Directory: `.` (root)
- Install Command: `npm install`

## Success Indicators

✅ Health endpoint returns database: "connected"
✅ API endpoints return data instead of timeout
✅ Logs show "Using cached MongoDB connection" after first request
