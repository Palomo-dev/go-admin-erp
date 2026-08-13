# Check what process owns PID 27132
$proc = Get-Process -Id 27132 -ErrorAction SilentlyContinue
if ($proc) {
    Write-Host "PID 27132: $($proc.ProcessName)"
    Write-Host "Path: $($proc.Path)"
    Write-Host "MainModule: $($proc.MainModule.FileName)"
} else {
    Write-Host "PID 27132 not found as a process - might be a child process"
}

# Also check all listening ports
Write-Host "`n=== All listening ports for PID 27132 ==="
Get-NetTCPConnection -OwningProcess 27132 -ErrorAction SilentlyContinue | Format-Table

# Check via CIM
Write-Host "`n=== CIM Process info ==="
$cim = Get-CimInstance Win32_Process -Filter "ProcessId=27132"
if ($cim) {
    Write-Host "Name: $($cim.Name)"
    Write-Host "CommandLine: $($cim.CommandLine)"
    Write-Host "ExecutablePath: $($cim.ExecutablePath)"
    Write-Host "ParentProcessId: $($cim.ParentProcessId)"
    
    $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($cim.ParentProcessId)"
    if ($parent) {
        Write-Host "`nParent: $($parent.Name)"
        Write-Host "Parent CMD: $($parent.CommandLine)"
    }
}
