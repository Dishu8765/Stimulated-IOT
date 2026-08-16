# PowerShell deployment script for backend to AWS Elastic Beanstalk

Write-Host "🚀 Deploying backend to AWS Elastic Beanstalk..." -ForegroundColor Cyan

Set-Location backend

# Check if EB is initialized
if (-Not (Test-Path ".elasticbeanstalk")) {
    Write-Host "❌ Elastic Beanstalk not initialized. Run 'eb init' first." -ForegroundColor Red
    exit 1
}

# Deploy
Write-Host "📦 Deploying to Elastic Beanstalk..." -ForegroundColor Yellow
eb deploy

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Backend deployed successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Check status: eb status" -ForegroundColor Cyan
    Write-Host "📝 View logs: eb logs" -ForegroundColor Cyan
    Write-Host "🌐 Open app: eb open" -ForegroundColor Cyan
} else {
    Write-Host "❌ Deployment failed. Check logs with: eb logs" -ForegroundColor Red
    exit 1
}
