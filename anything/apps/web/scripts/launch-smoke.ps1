param(
  [string]$BaseUrl = "",
  [switch]$RunBuild,
  [switch]$RunTypecheck
)

$ErrorActionPreference = "Stop"

function Write-Section {
  param([string]$Text)
  Write-Host ""
  Write-Host "== $Text =="
}

function Get-EnvValueFromFile {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path $Path)) {
    return ""
  }

  $line = Get-Content -Path $Path | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
  if (-not $line) {
    return ""
  }

  return ($line -replace "^\s*$Key\s*=", "").Trim()
}

function Invoke-JsonCheck {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [Parameter(Mandatory = $true)][int]$ExpectedStatus,
    [hashtable]$Body = @{},
    [scriptblock]$AssertBody = { param($x) $true }
  )

  $statusCode = 0
  $rawBody = ""
  $jsonBody = $null

  try {
    if ($Method -eq "GET") {
      $response = Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing
    } else {
      $response = Invoke-WebRequest -Uri $Url -Method $Method -UseBasicParsing -ContentType "application/json" -Body (ConvertTo-Json $Body -Depth 8)
    }

    $statusCode = [int]$response.StatusCode
    $rawBody = [string]$response.Content
  } catch {
    if ($_.Exception.Response) {
      $statusCode = [int]$_.Exception.Response.StatusCode.value__
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $rawBody = $reader.ReadToEnd()
      $reader.Close()
    } else {
      $statusCode = -1
      $rawBody = [string]$_.Exception.Message
    }
  }

  if ($rawBody) {
    try {
      $jsonBody = $rawBody | ConvertFrom-Json
    } catch {
      $jsonBody = $null
    }
  }

  $okStatus = ($statusCode -eq $ExpectedStatus)
  $okBody = & $AssertBody $jsonBody
  $ok = $okStatus -and $okBody

  [pscustomobject]@{
    Name           = $Name
    Url            = $Url
    Status         = $statusCode
    ExpectedStatus = $ExpectedStatus
    Passed         = $ok
    Body           = $rawBody
    JsonBody       = $jsonBody
  }
}

function Test-BaseUrlReachable {
  param(
    [Parameter(Mandatory = $true)][string]$Url
  )

  try {
    Invoke-WebRequest -Uri $Url -Method GET -UseBasicParsing -TimeoutSec 5 | Out-Null
    return $true
  } catch {
    # Any HTTP response (including 404/401) means host is reachable.
    if ($_.Exception.Response) {
      return $true
    }
    return $false
  }
}

if (-not $BaseUrl) {
  $envPath = Join-Path (Get-Location) ".env.local"
  $appUrlFromEnv = Get-EnvValueFromFile -Path $envPath -Key "APP_URL"
  if ($appUrlFromEnv) {
    $BaseUrl = $appUrlFromEnv
  } else {
    $BaseUrl = "http://localhost:4000"
  }
}

$BaseUrl = $BaseUrl.TrimEnd("/")
Write-Host "Launch smoke target: $BaseUrl"

$isReachable = Test-BaseUrlReachable -Url $BaseUrl
if (-not $isReachable -and $BaseUrl -eq "http://localhost:4000") {
  $fallbackUrl = "http://localhost:5173"
  if (Test-BaseUrlReachable -Url $fallbackUrl) {
    $BaseUrl = $fallbackUrl
    Write-Host "Target fallback detected: $BaseUrl"
    $isReachable = $true
  }
}

if (-not $isReachable) {
  Write-Host ""
  Write-Host "[FAIL] App is not reachable at $BaseUrl"
  Write-Host "Start the app first, then rerun smoke test."
  Write-Host "Example:"
  Write-Host "  npm run dev -- --port 4000"
  Write-Host "  npm run smoke:launch"
  Write-Host "Or point to deployed URL:"
  Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/launch-smoke.ps1 -BaseUrl https://your-domain.com"
  exit 2
}

$results = New-Object System.Collections.Generic.List[object]

Write-Section "API Smoke"

$results.Add((Invoke-JsonCheck `
    -Name "Auth token unauth returns 401" `
    -Method "GET" `
    -Url "$BaseUrl/api/auth/token" `
    -ExpectedStatus 401 `
    -AssertBody { param($x) $x -and $x.error -eq "Unauthorized" }))

$results.Add((Invoke-JsonCheck `
    -Name "User role unauth returns 401" `
    -Method "GET" `
    -Url "$BaseUrl/api/user/role" `
    -ExpectedStatus 401))

$results.Add((Invoke-JsonCheck `
    -Name "Admin settings unauth returns 401" `
    -Method "GET" `
    -Url "$BaseUrl/api/admin/settings" `
    -ExpectedStatus 401))

$results.Add((Invoke-JsonCheck `
    -Name "Public submit missing fields returns 400" `
    -Method "POST" `
    -Url "$BaseUrl/api/public/submit-ad" `
    -ExpectedStatus 400 `
    -Body @{} `
    -AssertBody { param($x) $x -and $x.error -eq "Missing required fields" }))

$results.Add((Invoke-JsonCheck `
    -Name "Public submit honeypot short-circuits" `
    -Method "POST" `
    -Url "$BaseUrl/api/public/submit-ad" `
    -ExpectedStatus 200 `
    -Body @{ website = "bot-filled" } `
    -AssertBody { param($x) $x -and $x.success -eq $true }))

$results.Add((Invoke-JsonCheck `
    -Name "Public submit invalid email returns 400" `
    -Method "POST" `
    -Url "$BaseUrl/api/public/submit-ad" `
    -ExpectedStatus 400 `
    -Body @{
      advertiser_name = "Smoke Test Advertiser"
      contact_name = "Smoke Test Contact"
      email = "not-an-email"
      ad_name = "Smoke Test Ad"
      post_type = "One-Time Post"
    } `
    -AssertBody { param($x) $x -and $x.error -eq "Invalid email address" }))

$apiFallbackDetected =
  ($results[0].Status -eq 200) -and
  ([string]$results[0].Body).TrimStart().StartsWith("<!DOCTYPE html")

if ($apiFallbackDetected) {
  Write-Section "Runtime Mismatch"
  Write-Host "[FAIL] /api routes are returning SPA HTML, not JSON responses."
  Write-Host "This means the running server is client-only for /api in this environment."
  Write-Host ""
  Write-Host "Use one of these options:"
  Write-Host "  1) Run smoke tests against the deployed backend URL:"
  Write-Host "     powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/launch-smoke.ps1 -BaseUrl https://your-domain.com"
  Write-Host "  2) Start the runtime that actually mounts src/app/api/**/route.js (if different from current dev server)."
}

if ($RunTypecheck) {
  Write-Section "Typecheck"
  npm run typecheck
}

if ($RunBuild) {
  Write-Section "Build"
  npm run build
}

Write-Section "Summary"

$passCount = ($results | Where-Object { $_.Passed }).Count
$failCount = $results.Count - $passCount

foreach ($item in $results) {
  $marker = if ($item.Passed) { "[PASS]" } else { "[FAIL]" }
  Write-Host "$marker $($item.Name) (status $($item.Status), expected $($item.ExpectedStatus))"
  if (-not $item.Passed) {
    Write-Host "  URL: $($item.Url)"
    if ($item.Body) {
      $snippet = $item.Body
      if ($snippet.Length -gt 280) {
        $snippet = $snippet.Substring(0, 280) + "..."
      }
      Write-Host "  Body: $snippet"
    }
  }
}

Write-Host ""
Write-Host "Checks passed: $passCount/$($results.Count)"

if ($failCount -gt 0) {
  exit 1
}

exit 0
