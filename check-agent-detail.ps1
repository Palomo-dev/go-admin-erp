# Check node processes with command lines matching print-agent
$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'"
foreach ($p in $procs) {
    if ($p.CommandLine -match 'print-agent|agentRunner|discoveryServer|index.ts') {
        Write-Host "PID: $($p.ProcessId)"
        Write-Host "CMD: $($p.CommandLine)"
        Write-Host "---"
    }
}

Write-Host "`n=== Electron store ==="
$storePath = Join-Path $env:APPDATA "go-admin-desktop\config.json"
if (Test-Path $storePath) {
    Get-Content $storePath
} else {
    Write-Host "No config.json found in go-admin-desktop"
}

# Check for agent-config.json in print-agent
$agentConfig = "c:\Users\USUARIO\CascadeProjects\go-admin-erp\print-agent\agent-config.json"
if (Test-Path $agentConfig) {
    Write-Host "`n=== agent-config.json ==="
    Get-Content $agentConfig
} else {
    Write-Host "`nNo agent-config.json in print-agent/"
}

# Check discovery server port 3456
Write-Host "`n=== Port 3456 check ==="
$port = Get-NetTCPConnection -LocalPort 3456 -ErrorAction SilentlyContinue
if ($port) {
    Write-Host "Port 3456 is LISTENING (PID: $($port.OwningProcess))"
} else {
    Write-Host "Port 3456 is NOT listening - Print Agent discovery server is NOT running"
}
