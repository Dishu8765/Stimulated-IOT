# AWS Deployment Quick Start

This is the fast-track guide to get your IoT monitor live on AWS in ~20 minutes.

## Prerequisites Check

```bash
# Check if AWS CLI is installed
aws --version

# Check if EB CLI is installed
eb --version

# Check Node.js
node --version
```

If any are missing, see [DEPLOYMENT.md](./DEPLOYMENT.md) for installation instructions.

---

## Step 1: Configure AWS Credentials (5 min)

```bash
aws configure
```

You'll need:
- AWS Access Key ID (get from AWS Console → IAM → Users → Security credentials)
- AWS Secret Access Key
- Region: `us-east-1` (or your preferred region)
- Output: `json`

---

## Step 2: Deploy Backend (8 min)

```bash
cd backend

# Initialize Elastic Beanstalk (first time only)
eb init

# Answer prompts:
# - Region: (your choice, e.g., us-east-1)
# - Application name: simulated-iot-backend
# - Platform: Node.js
# - Platform version: Node.js 18 running on 64bit Amazon Linux 2
# - SSH: Yes (recommended)

# Create environment and deploy
eb create simulated-iot-env

# Wait ~5 minutes for environment creation...

# Set environment variables
eb setenv \
  MQTT_BROKER=mqtt://broker.hivemq.com \
  MQTT_TOPIC=silabs-prep/envmonitor/readings \
  HISTORY_SIZE=100

# Get your backend URL
eb status
```

Your backend URL will look like:
```
http://simulated-iot-env.eba-xxxxxxxx.us-east-1.elasticbeanstalk.com
```

**Save this URL** — you'll need it for the frontend.

Test it:
```bash
curl http://YOUR-BACKEND-URL/api/readings
```

---

## Step 3: Deploy Frontend (7 min)

### Update Backend URL

Edit `frontend/.env`:
```
VITE_BACKEND_URL=http://YOUR-BACKEND-URL.elasticbeanstalk.com
```

### Deploy to S3

**On Windows (PowerShell):**
```powershell
.\deploy-frontend.ps1
```

**On Mac/Linux:**
```bash
chmod +x deploy-frontend.sh
./deploy-frontend.sh
```

Or manually:

```bash
cd frontend

# Build
npm install
npm run build

# Create unique bucket name
BUCKET_NAME="iot-monitor-frontend-$(date +%s)"

# Create bucket
aws s3 mb s3://$BUCKET_NAME --region us-east-1

# Configure as website
aws s3 website s3://$BUCKET_NAME \
  --index-document index.html \
  --error-document index.html

# Set public policy (create bucket-policy.json first)
cat > bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadGetObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
  }]
}
EOF

aws s3api put-bucket-policy \
  --bucket $BUCKET_NAME \
  --policy file://bucket-policy.json

# Upload
aws s3 sync dist/ s3://$BUCKET_NAME --delete

echo "✅ Done! URL: http://$BUCKET_NAME.s3-website-us-east-1.amazonaws.com"
```

---

## Step 4: Test Everything

1. **Open your S3 website URL** in a browser
2. You should see the dashboard with "Connected" status
3. **Test with simulate endpoint**:
   ```bash
   curl -X POST http://YOUR-BACKEND-URL/api/simulate \
     -H "Content-Type: application/json" \
     -d '{"temp": 26.4, "humidity": 58, "emergency": false}'
   ```
4. The reading should appear on your dashboard immediately

---

## Step 5: Connect Wokwi Simulation (Optional)

1. Go to [wokwi.com](https://wokwi.com)
2. Create ESP32 project
3. Copy `sketch.ino` and `diagram.json` from this repo
4. Start simulation
5. Watch live data flow to your AWS-hosted dashboard

---

## URLs Summary

After deployment, save these:

| Service | URL |
|---------|-----|
| **Backend API** | `http://simulated-iot-env.eba-XXXX.elasticbeanstalk.com` |
| **Frontend** | `http://iot-monitor-frontend-XXXX.s3-website-us-east-1.amazonaws.com` |
| **Backend logs** | Run `eb logs` from `/backend` folder |

---

## Common Issues

### "EB CLI not found"
```bash
pip install awsebcli --upgrade --user
```

### "AWS credentials not configured"
```bash
aws configure
```

### CORS errors in browser
Your frontend URL needs to be added to backend CORS config. See [DEPLOYMENT.md](./DEPLOYMENT.md#step-3-update-cors-for-backend).

### Backend shows "Degraded" status
```bash
cd backend
eb logs
```
Check for missing environment variables or startup errors.

---

## Update After Code Changes

### Backend
```bash
cd backend
eb deploy
```

### Frontend
```bash
cd frontend
npm run build
aws s3 sync dist/ s3://YOUR-BUCKET-NAME --delete
```

---

## Cleanup (Stop Charges)

```bash
# Delete backend
cd backend
eb terminate simulated-iot-env

# Delete frontend
aws s3 rm s3://YOUR-BUCKET-NAME --recursive
aws s3 rb s3://YOUR-BUCKET-NAME
```

---

## Cost

**Estimated: $13/month** (or FREE for 12 months with AWS Free Tier)

- EC2 t3.micro: ~$10/month (750 hours/month free tier)
- S3: ~$1/month (5 GB free tier)
- Data transfer: ~$2/month (15 GB free tier)

---

## Next Steps

✅ Working deployment
⬜ Add HTTPS with CloudFront (see [DEPLOYMENT.md](./DEPLOYMENT.md#part-3-add-cloudfront-optional-but-recommended))
⬜ Custom domain
⬜ CI/CD pipeline (GitHub Actions)
⬜ Monitoring (CloudWatch)

For detailed guides on any of these, see [DEPLOYMENT.md](./DEPLOYMENT.md).
