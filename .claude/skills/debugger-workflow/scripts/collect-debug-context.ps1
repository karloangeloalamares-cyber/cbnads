param(
  [string]$AppPath = "anything/apps/web"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Debug Context Collector ==="
Write-Host "UTC: $(Get-Date -Format o)"
Write-Host "Root: $(Get-Location)"
Write-Host "AppPath: $AppPath"

if (-not (Test-Path $AppPath)) {
  Write-Error "App path not found: $AppPath"
  exit 1
}

Push-Location $AppPath
try {
  Write-Host "`n--- git status --short ---"
  git status --short

  Write-Host "`n--- git branch --show-current ---"
  git branch --show-current

  Write-Host "`n--- recent commits ---"
  git log --oneline -n 8

  Write-Host "`n--- node and npm ---"
  node --version
  npm --version

  Write-Host "`n--- package scripts ---"
  if (Test-Path "package.json") {
    (Get-Content "package.json" -Raw)
  } else {
    Write-Host "No package.json found."
  }

  Write-Host "`n--- env keys present (names only) ---"
  if (Test-Path ".env.local") {
    Get-Content ".env.local" |
      Where-Object { $_ -match "^[A-Za-z0-9_]+=" } |
      ForEach-Object { ($_ -split "=")[0] }
  } else {
    Write-Host ".env.local not found."
  }

  Write-Host "`n--- build probe ---"
  npm run build
}
finally {
  Pop-Location
}
