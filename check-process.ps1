Get-Process | Where-Object { $_.ProcessName -match 'electron|go-admin|GoAdmin|node' } | Select-Object Id, ProcessName | Format-Table -AutoSize
