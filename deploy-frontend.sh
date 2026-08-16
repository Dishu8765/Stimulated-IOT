#!/bin/bash

# Quick deploy script for frontend to AWS S3

echo "🚀 Deploying frontend to AWS S3..."

# Configuration
BUCKET_NAME="iot-monitor-frontend-${USER}-$(date +%s)"
REGION="us-east-1"

cd frontend

# Build
echo "📦 Building frontend..."
npm install
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed"
  exit 1
fi

# Create S3 bucket
echo "🪣 Creating S3 bucket: $BUCKET_NAME"
aws s3 mb s3://$BUCKET_NAME --region $REGION

# Configure as static website
echo "⚙️  Configuring static website hosting..."
aws s3 website s3://$BUCKET_NAME \
  --index-document index.html \
  --error-document index.html

# Set public read policy
echo "🔓 Setting bucket policy..."
cat > /tmp/bucket-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::$BUCKET_NAME/*"
    }
  ]
}
EOF

aws s3api put-bucket-policy \
  --bucket $BUCKET_NAME \
  --policy file:///tmp/bucket-policy.json

# Upload files
echo "📤 Uploading files..."
aws s3 sync dist/ s3://$BUCKET_NAME \
  --delete \
  --cache-control "public, max-age=3600"

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Frontend deployed successfully!"
  echo ""
  echo "🌐 Website URL:"
  echo "   http://$BUCKET_NAME.s3-website-$REGION.amazonaws.com"
  echo ""
  echo "⚠️  Don't forget to:"
  echo "   1. Update frontend/.env with your backend URL"
  echo "   2. Rebuild and re-upload: npm run build && aws s3 sync dist/ s3://$BUCKET_NAME --delete"
  echo "   3. Optionally set up CloudFront for HTTPS"
else
  echo "❌ Deployment failed"
  exit 1
fi
