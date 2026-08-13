try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3456/discover' -UseBasicParsing -TimeoutSec 5
    Write-Host "=== /discover ==="
    Write-Host $r.Content
} catch {
    Write-Host "Error /discover: $($_.Exception.Message)"
}

Write-Host ""

try {
    $r = Invoke-WebRequest -Uri 'http://localhost:3456/printer-info?name=AON Printer' -UseBasicParsing -TimeoutSec 10
    Write-Host "=== /printer-info ==="
    Write-Host $r.Content
} catch {
    Write-Host "Error /printer-info: $($_.Exception.Message)"
}

Write-Host ""

try {
    $body = '{"printerName":"AON Printer"}'
    $r = Invoke-WebRequest -Uri 'http://localhost:3456/test-print' -Method POST -Body $body -ContentType 'application/json' -UseBasicParsing -TimeoutSec 15
    Write-Host "=== /test-print ==="
    Write-Host $r.Content
} catch {
    Write-Host "Error /test-print: $($_.Exception.Message)"
}
