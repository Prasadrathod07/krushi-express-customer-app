# Fix Windows File Watcher Limit
# Run this script as Administrator

Write-Host "=== Fixing Windows File Watcher Limit ===" -ForegroundColor Cyan
Write-Host ""

# Check if running as admin
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "⚠️  ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To run as Administrator:" -ForegroundColor Yellow
    Write-Host "  1. Right-click PowerShell" -ForegroundColor White
    Write-Host "  2. Select 'Run as Administrator'" -ForegroundColor White
    Write-Host "  3. Navigate to this directory and run the script again" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host "[1/2] Setting MaxWatchers registry value..." -ForegroundColor Yellow

try {
    $path = "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem"
    $name = "MaxWatchers"
    $value = 524288
    
    New-ItemProperty -Path $path -Name $name -Value $value -PropertyType DWORD -Force | Out-Null
    
    Write-Host "  ✓ Registry value set successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "[2/2] IMPORTANT: You must restart your computer for this to take effect!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "After restarting, run:" -ForegroundColor Cyan
    Write-Host "  npm start" -ForegroundColor White
    Write-Host ""
    Write-Host "The file watcher error should be fixed!" -ForegroundColor Green
    
} catch {
    Write-Host "  ✗ Failed to set registry value: $_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Try running this command manually:" -ForegroundColor Yellow
    Write-Host "  New-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'MaxWatchers' -Value 524288 -PropertyType DWORD -Force" -ForegroundColor White
    exit 1
}


