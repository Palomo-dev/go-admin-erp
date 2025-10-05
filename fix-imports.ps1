$files = Get-ChildItem -Path ".\src" -Recurse -Include *.tsx,*.ts

foreach ($file in $files) {
    $content = Get-Content -Path $file.FullName -Raw
    $newContent = $content -replace "@/hooks/use-toast", "@/components/ui/use-toast"
    
    if ($content -ne $newContent) {
        Set-Content -Path $file.FullName -Value $newContent -NoNewline
        Write-Host "Fixed: $($file.FullName)"
    }
}

Write-Host "Done! All imports fixed."
