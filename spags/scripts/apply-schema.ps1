param(
  [string]$ProjectName = "slatepress's Project",
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN
)

$ErrorActionPreference = "Stop"
$schemaPath = Join-Path $PSScriptRoot "..\supabase\schema.sql"
$devVarsPath = Join-Path $PSScriptRoot "..\.dev.vars"

if (-not $AccessToken) {
  $tokenPath = Join-Path $env:USERPROFILE ".supabase\access-token"
  if (Test-Path $tokenPath) {
    $AccessToken = (Get-Content $tokenPath -Raw).Trim()
  }
}

if (-not $AccessToken) {
  Write-Host "No Supabase access token found." -ForegroundColor Yellow
  Write-Host "Run: npx supabase login"
  Write-Host "Or set SUPABASE_ACCESS_TOKEN from https://supabase.com/dashboard/account/tokens"
  exit 1
}

$headers = @{
  Authorization = "Bearer $AccessToken"
  "Content-Type" = "application/json"
}

Write-Host "Fetching projects..." -ForegroundColor Cyan
$projects = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects" -Headers $headers
$project = $projects | Where-Object { $_.name -eq $ProjectName } | Select-Object -First 1

if (-not $project) {
  Write-Host "Project not found: $ProjectName" -ForegroundColor Red
  Write-Host "Available projects:"
  $projects | ForEach-Object { Write-Host "  - $($_.name) ($($_.id))" }
  exit 1
}

$ref = $project.id
Write-Host "Using project: $($project.name) ($ref)" -ForegroundColor Green

Write-Host "Applying schema..." -ForegroundColor Cyan
$sql = Get-Content $schemaPath -Raw
Invoke-RestMethod `
  -Method POST `
  -Uri "https://api.supabase.com/v1/projects/$ref/database/query" `
  -Headers $headers `
  -Body (@{ query = $sql } | ConvertTo-Json -Depth 3) | Out-Null

Write-Host "Schema applied." -ForegroundColor Green

Write-Host "Fetching API keys..." -ForegroundColor Cyan
$keys = Invoke-RestMethod -Uri "https://api.supabase.com/v1/projects/$ref/api-keys" -Headers $headers
$serviceRole = $keys | Where-Object { $_.name -eq "service_role" } | Select-Object -First 1
$anon = $keys | Where-Object { $_.name -eq "anon" } | Select-Object -First 1

if (-not $serviceRole) {
  Write-Host "Could not fetch service_role key. Add it manually to .dev.vars" -ForegroundColor Yellow
  exit 0
}

$projectUrl = "https://$ref.supabase.co"
$devVars = @(
  "SUPABASE_URL=$projectUrl",
  "SUPABASE_SERVICE_ROLE_KEY=$($serviceRole.api_key)",
  "SCRAPE_API_KEY="
) -join "`n"

Set-Content -Path $devVarsPath -Value $devVars -NoNewline
Write-Host "Wrote $devVarsPath" -ForegroundColor Green
Write-Host "Project URL: $projectUrl"
