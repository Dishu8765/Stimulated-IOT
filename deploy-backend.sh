#!/bin/bash

# Quick deploy script for backend to AWS Elastic Beanstalk

echo "🚀 Deploying backend to AWS Elastic Beanstalk..."

cd backend

# Check if EB is initialized
if [ ! -d ".elasticbeanstalk" ]; then
  echo "❌ Elastic Beanstalk not initialized. Run 'eb init' first."
  exit 1
fi

# Deploy
echo "📦 Deploying to Elastic Beanstalk..."
eb deploy

if [ $? -eq 0 ]; then
  echo "✅ Backend deployed successfully!"
  echo ""
  echo "📊 Check status: eb status"
  echo "📝 View logs: eb logs"
  echo "🌐 Open app: eb open"
else
  echo "❌ Deployment failed. Check logs with: eb logs"
  exit 1
fi
