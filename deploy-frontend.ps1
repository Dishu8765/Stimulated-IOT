# PowerShell deployment script for frontend to AWS S3

Write-Host "🚀 Deploying frontend to AWS S3..." -ForegroundColor Cyan

# Configuration
$BUCKET_NAME = "iot-monitor-frontend-$env:USERNAME-$(Get-Date -Format 'yyyyMMddHHmmss')"
$REGION = "us-east-1"

Set-Location frontend

# Build
Write-Host "📦 Building frontend..." -ForegroundColor Yellow
npm install
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}

# Create S3 bucket
Write-Host "🪣 Creating S3 bucket: $BUCKET_NAME" -ForegroundColor Yellow
aws s3 mb "s3://$BUCKET_NAME" --region $REGION

# Configure as static website
Write-Host "⚙️  Configuring static website hosting..." -ForegroundColor Yellow
aws s3 website "s3://$BUCKET_NAME" `
  --index-document index.html `
  --error-document index.html

# Set public read policy
Write-Host "🔓 Setting bucket policy..." -ForegroundColor Yellow
$policyJson = @"
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
"@

$policyJson | Out-File -FilePath "$env:TEMP\bucket-policy.json" -Encoding UTF8

aws s3api put-bucket-policy `
  --bucket $BUCKET_NAME `
  --policy "file://$env:TEMP\bucket-policy.json"

# Upload files
Write-Host "📤 Uploading files..." -ForegroundColor Yellow
aws s3 sync dist/ "s3://$BUCKET_NAME" `
  --delete `
  --cache-control "public, max-age=3600"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Frontend deployed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🌐 Website URL:" -ForegroundColor Cyan
    Write-Host "   http://$BUCKET_NAME.s3-website-$REGION.amazonaws.com"
    Write-Host ""
    Write-Host "⚠️  Don't forget to:" -ForegroundColor Yellow
    Write-Host "   1. Update frontend/.env with your backend URL"
    Write-Host "   2. Rebuild and re-upload: npm run build && aws s3 sync dist/ s3://$BUCKET_NAME --delete"
    Write-Host "   3. Optionally set up CloudFront for HTTPS"
} else {
    Write-Host "❌ Deployment failed" -ForegroundColor Red
    exit 1
}
