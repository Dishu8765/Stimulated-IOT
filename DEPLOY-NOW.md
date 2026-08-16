# 🚀 Ready to Deploy to AWS

Your project is **deployment-ready**. Here's what I've set up for you:

---

## What's Ready

✅ **Backend configured for Elastic Beanstalk**
- Changed default port from 4000 → 8080 (EB standard)
- Added `.ebignore` and `.ebextensions/` config
- Added Node.js engine specification

✅ **Frontend build-ready for S3**
- Production build configured
- Environment variable support for backend URL

✅ **Deployment scripts**
- `deploy-backend.sh` / `deploy-backend.ps1`
- `deploy-frontend.sh` / `deploy-frontend.ps1`

✅ **Complete documentation**
- `AWS-QUICKSTART.md` — 20-minute fast-track guide
- `DEPLOYMENT.md` — comprehensive reference (CloudFront, custom domains, troubleshooting)

---

## What You Need to Do

### 1. Install AWS Tools (one-time setup)

#### AWS CLI

**Windows:**
```powershell
# Run as Administrator
msiexec.exe /i https://awscli.amazonaws.com/AWSCLIV2.msi
```

**Mac:**
```bash
brew install awscli
```

**Linux:**
```bash
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

#### EB CLI

```bash
pip install awsebcli --upgrade --user
```

#### Configure AWS

```bash
aws configure
```

You'll need:
- **AWS Access Key ID** (get from AWS Console → IAM → Users → Your User → Security credentials → Create access key)
- **AWS Secret Access Key**
- **Region**: `us-east-1` (or your preferred region)
- **Output format**: `json`

---

### 2. Deploy Backend (~8 minutes)

```bash
cd backend

# Initialize (first time only)
eb init
# - Region: us-east-1
# - App name: simulated-iot-backend
# - Platform: Node.js 18
# - SSH: Yes

# Create and deploy
eb create simulated-iot-env

# Set environment variables
eb setenv \
  MQTT_BROKER=mqtt://broker.hivemq.com \
  MQTT_TOPIC=silabs-prep/envmonitor/readings \
  HISTORY_SIZE=100

# Get your URL
eb status
```

**Save your backend URL** (looks like `http://simulated-iot-env.eba-XXXXX.elasticbeanstalk.com`)

---

### 3. Deploy Frontend (~7 minutes)

#### Update backend URL
Edit `frontend/.env`:
```
VITE_BACKEND_URL=http://YOUR-BACKEND-URL.elasticbeanstalk.com
```

#### Deploy
**On Windows:**
```powershell
.\deploy-frontend.ps1
```

**On Mac/Linux:**
```bash
chmod +x deploy-frontend.sh
./deploy-frontend.sh
```

Your frontend URL will be: `http://iot-monitor-frontend-XXXXX.s3-website-us-east-1.amazonaws.com`

---

### 4. Test

Open your S3 frontend URL, then inject a test reading:

```bash
curl -X POST http://YOUR-BACKEND-URL/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"temp": 26.4, "humidity": 58, "emergency": false}'
```

You should see it appear on the dashboard instantly.

---

## Quick Reference

| Task | Command |
|------|---------|
| **Deploy backend** | `cd backend && eb deploy` |
| **Deploy frontend** | `cd frontend && npm run build && aws s3 sync dist/ s3://YOUR-BUCKET --delete` |
| **View backend logs** | `cd backend && eb logs` |
| **Check backend status** | `cd backend && eb status` |
| **Stop backend** | `cd backend && eb terminate` |

---

## Cost

**~$13/month** (or **FREE** with AWS Free Tier for first 12 months)

---

## Support

- **Quick start**: See [AWS-QUICKSTART.md](./AWS-QUICKSTART.md)
- **Full guide**: See [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Troubleshooting**: See [DEPLOYMENT.md#troubleshooting](./DEPLOYMENT.md#troubleshooting)

---

## Alternative: One-Click Deploy Options

If you prefer not to use AWS CLI, you can also:

1. **AWS Amplify** — Connect your GitHub repo, auto-deploys on push
2. **Vercel** — Frontend only (you'd still need backend elsewhere)
3. **Railway** — Full-stack deployment with Git integration
4. **Render** — Similar to Railway, free tier available

See [DEPLOYMENT.md](./DEPLOYMENT.md#alternative-deployment-options) for guides.

---

## What's Next?

After successful deployment:

1. ✅ Add HTTPS with CloudFront
2. ✅ Set up custom domain
3. ✅ Configure CI/CD (GitHub Actions)
4. ✅ Add monitoring (CloudWatch)
5. ✅ Set up auto-scaling

All covered in [DEPLOYMENT.md](./DEPLOYMENT.md).

---

**You're all set!** Start with [AWS-QUICKSTART.md](./AWS-QUICKSTART.md) and you'll be live in ~20 minutes.
