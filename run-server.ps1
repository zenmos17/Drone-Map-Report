Set-Location -Path $PSScriptRoot
Write-Host "Starting Drone-Map server..." -ForegroundColor Cyan
node backend/server.js
Write-Host "`nServer stopped. Press Enter to close." -ForegroundColor Yellow
Read-Host
