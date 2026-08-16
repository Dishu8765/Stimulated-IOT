# AWS Deployment Guide

This guide covers deploying the IoT Environmental Monitor to AWS using:
- **Backend**: AWS Elastic Beanstalk (Node.js environment)
- **Frontend**: AWS S3 + CloudFront (static site hosting with CDN)

---

## Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **EB CLI** (Elastic Beanstalk CLI) installed
4. **Node.js** 18+ and npm installed locally

### Install AWS CLI

**Windows** (PowerShell as Administrator):
```powershell
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi
```

**macOS**:
```bash
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /
```

**Linux**:
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

### Configure AWS CLI

```bash
aws configure
```

Provide:
- AWS Access Key ID
- AWS Secret Access Key
- Default region (e.g., `us-east-1`)
- Output format: `json`

### Install EB CLI

```bash
pip install awsebcli --upgrade --user
```

---

## Part 1: Deploy Backend (Elastic Beanstalk)

### Step 1: Initialize Elastic Beanstalk

```bash
cd backend
eb init
```

When prompted:
1. Select your region (e.g., `us-east-1`)
2. Create new application: **simulated-iot-backend**
3. Platform: **Node.js**
4. Platform branch: **Node.js 18 running on 64bit Amazon Linux 2**
5. CodeCommit: **No**
6. SSH: **Yes** (recommended)

### Step 2: Create Environment

```bash
eb create simulated-iot-env
```

This will:
- Create an EC2 instance
- Set up load balancer
- Configure security groups
- Deploy your application

Wait 5-10 minutes for the environment to be ready.

### Step 3: Set Environment Variables

```bash
eb setenv \
  MQTT_BROKER=mqtt://broker.hivemq.com \
  MQTT_TOPIC=silabs-prep/envmonitor/readings \
  HISTORY_SIZE=100
```

### Step 4: Open the Application

```bash
eb open
```

Your backend will be accessible at:
```
http://simulated-iot-env.eba-xxxxxxxx.us-east-1.elasticbeanstalk.com
```

Test it:
```bash
curl http://YOUR-EB-URL.elasticbeanstalk.com/api/readings
```

### Useful EB Commands

```bash
eb status                # Check environment status
eb logs                  # View logs
eb deploy                # Deploy updates after code changes
eb terminate             # Delete environment (cleanup)
```

---

## Part 2: Deploy Frontend (S3 + CloudFront)

### Step 1: Build the Frontend

```bash
cd ../frontend
npm install
npm run build
```

This creates a `dist/` folder with optimized production files.

### Step 2: Create S3 Bucket

```bash
# Replace 'your-unique-bucket-name' with something globally unique
aws s3 mb s3://iot-monitor-frontend-12345 --region us-east-1
```

### Step 3: Configure Bucket for Static Website Hosting

```bash
aws s3 website s3://iot-monitor-frontend-12345 \
  --index-document index.html \
  --error-document index.html
```

### Step 4: Set Bucket Policy (Public Read Access)

Create a file `bucket-policy.json`:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::iot-monitor-frontend-12345/*"
    }
  ]
}
```

Apply the policy:
```bash
aws s3api put-bucket-policy \
  --bucket iot-monitor-frontend-12345 \
  --policy file://bucket-policy.json
```

### Step 5: Upload Frontend Files

```bash
aws s3 sync dist/ s3://iot-monitor-frontend-12345 \
  --delete \
  --cache-control "public, max-age=3600"
```

### Step 6: Update Frontend Environment Variable

Edit `frontend/.env`:
```
VITE_BACKEND_URL=http://YOUR-EB-URL.elasticbeanstalk.com
```

Rebuild and re-upload:
```bash
npm run build
aws s3 sync dist/ s3://iot-monitor-frontend-12345 --delete
```

### Step 7: Access Your Frontend

S3 website URL:
```
http://iot-monitor-frontend-12345.s3-website-us-east-1.amazonaws.com
```

---

## Part 3: Add CloudFront (Optional but Recommended)

CloudFront provides:
- HTTPS support
- Global CDN caching
- Custom domain support
- Better performance

### Step 1: Create CloudFront Distribution

```bash
aws cloudfront create-distribution \
  --origin-domain-name iot-monitor-frontend-12345.s3-website-us-east-1.amazonaws.com \
  --default-root-object index.html
```

Or use the AWS Console:
1. Go to CloudFront → Create Distribution
2. Origin domain: Select your S3 bucket
3. Origin access: Public
4. Viewer protocol policy: Redirect HTTP to HTTPS
5. Create distribution

Wait 15-20 minutes for deployment.

### Step 2: Get CloudFront URL

Your app will be available at:
```
https://d1234abcd5678.cloudfront.net
```

### Step 3: Update CORS for Backend

Since frontend is now on a different domain, update backend CORS:

Edit `backend/server.js`:
```javascript
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://iot-monitor-frontend-12345.s3-website-us-east-1.amazonaws.com',
    'https://d1234abcd5678.cloudfront.net'
  ]
}));
```

Redeploy backend:
```bash
cd backend
eb deploy
```

---

## Architecture Diagram (AWS)

```
┌─────────────┐       MQTT       ┌──────────────┐
│   ESP32     │ ────────────────► │ Public MQTT  │
│  (Wokwi)    │                   │   Broker     │
└─────────────┘                   │  (HiveMQ)    │
                                  └──────┬───────┘
                                         │ subscribe
                                         ▼
┌─────────────────────────────────────────────────────┐
│         AWS Elastic Beanstalk (Backend)             │
│  ┌───────────────────────────────────────────────┐  │
│  │  Node.js + Express + Socket.io + MQTT client  │  │
│  │  EC2 instance (auto-scaling ready)            │  │
│  │  Load Balancer                                │  │
│  └───────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────┘
                         │ WebSocket/REST
                         ▼
┌─────────────────────────────────────────────────────┐
│              CloudFront (CDN)                       │
│                      ↓                              │
│              S3 Static Website                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  React App (built with Vite)                  │  │
│  │  index.html, JS bundles, CSS                  │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                         ↓
                   User's Browser
```

---

## Cost Estimate (Monthly)

| Service | Usage | Est. Cost |
|---------|-------|-----------|
| **Elastic Beanstalk** (t3.micro) | 1 instance, 24/7 | ~$10 |
| **S3** | 1 GB storage + transfers | ~$1 |
| **CloudFront** | 10 GB data transfer | ~$1 |
| **Data Transfer** | Outbound | ~$1 |
| **Total** | | **~$13/month** |

💡 **AWS Free Tier** (first 12 months) covers most of this if your account is eligible.

---

## Testing the Deployment

### 1. Test Backend Directly

```bash
# Get readings (should return empty array initially)
curl https://YOUR-EB-URL.elasticbeanstalk.com/api/readings

# Inject a test reading
curl -X POST https://YOUR-EB-URL.elasticbeanstalk.com/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"temp": 26.4, "humidity": 58, "emergency": false}'
```

### 2. Test Frontend

Open your CloudFront URL or S3 website URL in a browser. You should see:
- Green "Connected" status
- Dashboard loads without errors
- Injected readings appear in the chart and log

### 3. Test End-to-End with Wokwi

1. Go to [wokwi.com](https://wokwi.com)
2. Load your ESP32 simulation
3. Update `sketch.ino` if needed (MQTT broker is already public)
4. Start simulation
5. Watch readings appear on your deployed dashboard in real-time

---

## Custom Domain (Optional)

### Using Route 53 + CloudFront

1. Register domain in Route 53 (e.g., `iot-monitor.yourdomain.com`)
2. Request SSL certificate in ACM (AWS Certificate Manager)
3. Update CloudFront distribution to use custom domain
4. Create Route 53 A record pointing to CloudFront

### Using Your Own Domain Registrar

1. Point your domain's CNAME to CloudFront distribution URL
2. Add custom domain in CloudFront settings
3. Request/upload SSL certificate

---

## Monitoring & Logs

### Backend Logs (Elastic Beanstalk)

```bash
cd backend
eb logs
```

Or view in AWS Console:
- Elastic Beanstalk → Environments → Logs → Request Logs → Last 100 Lines

### Frontend Logs (CloudFront)

Enable CloudFront logging:
```bash
aws cloudfront update-distribution \
  --id YOUR-DISTRIBUTION-ID \
  --logging-config Enabled=true,Bucket=YOUR-LOG-BUCKET.s3.amazonaws.com,Prefix=cloudfront/
```

---

## Cleanup (Avoid Charges)

### Delete Backend

```bash
cd backend
eb terminate simulated-iot-env
```

Then in AWS Console, delete the Elastic Beanstalk application.

### Delete Frontend

```bash
# Delete S3 bucket contents
aws s3 rm s3://iot-monitor-frontend-12345 --recursive

# Delete bucket
aws s3 rb s3://iot-monitor-frontend-12345

# Delete CloudFront distribution (must disable first)
aws cloudfront delete-distribution --id YOUR-DISTRIBUTION-ID
```

---

## Troubleshooting

### Backend not connecting to MQTT

Check environment variables:
```bash
eb printenv
```

Ensure `MQTT_BROKER` and `MQTT_TOPIC` are set correctly.

### CORS errors in browser console

Update `backend/server.js` CORS config to include your frontend URL, then:
```bash
cd backend
eb deploy
```

### Frontend showing "Disconnected"

1. Check backend is running: `eb status`
2. Verify backend URL in `frontend/.env`
3. Check browser console for connection errors
4. Ensure Socket.io can connect (check security groups if using custom VPC)

### Build fails on Elastic Beanstalk

Check logs:
```bash
eb logs
```

Common issues:
- Missing `engines` field in `package.json` (already added)
- Wrong Node.js version
- Missing dependencies

---

## Alternative Deployment Options

### 1. AWS Amplify (All-in-One)

Simplest option — deploy both frontend and backend together:
```bash
npm install -g @aws-amplify/cli
amplify init
amplify add hosting
amplify add api
amplify publish
```

### 2. AWS ECS (Containerized)

For production-grade deployments:
- Dockerize backend
- Use ECR (Elastic Container Registry)
- Deploy with ECS Fargate

### 3. AWS Lambda + API Gateway (Serverless)

Refactor backend to serverless functions:
- Backend → Lambda functions
- MQTT → AWS IoT Core
- WebSocket → API Gateway WebSocket API

---

## Next Steps

1. ✅ Set up CI/CD pipeline (GitHub Actions → AWS)
2. ✅ Add custom domain
3. ✅ Enable HTTPS everywhere
4. ✅ Set up monitoring (CloudWatch)
5. ✅ Add authentication (Cognito)
6. ✅ Scale backend (auto-scaling group)

---

## Support

- AWS EB docs: https://docs.aws.amazon.com/elasticbeanstalk/
- AWS S3 docs: https://docs.aws.amazon.com/s3/
- CloudFront docs: https://docs.aws.amazon.com/cloudfront/
