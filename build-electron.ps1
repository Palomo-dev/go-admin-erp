Set-Location "c:\Users\USUARIO\CascadeProjects\go-admin-erp\electron"
Write-Host "=== Running sync:agent ==="
node scripts/sync-agent.js
Write-Host "=== Running tsc ==="
npx tsc -p . 2>&1
Write-Host "=== Build exit code: $LASTEXITCODE ==="
